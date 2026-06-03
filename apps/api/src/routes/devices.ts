import { and, desc, eq, gt, isNull } from "drizzle-orm"
import { Router } from "express"
import { verifyMessage } from "viem"
import {
  db,
  addresses,
  deviceSessions,
  devicePairingRequests,
  walletNonces,
} from "@walty/db"
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { getIp } from "@walty/shared/api-utils/get-ip"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"
import {
  markSessionTrusted,
  revokeSession,
} from "../services/deviceSessions.js"
import {
  disconnectSession,
  emitDeviceListChanged,
  emitDevicePairingApproved,
  emitDevicePairingRejected,
  emitDevicePairingRequested,
  emitDeviceRevoked,
} from "../ws/io.js"

const LABEL_MAX = 80

export const devicesRouter: Router = Router()

const PAIRING_TTL_MS = 10 * 60 * 1000

/**
 * Validates `{ nonce, signature }` against the user's linked wallet addresses
 * for `message`, consuming (deleting) the nonce on success. Throws on any
 * failure. Shared by device attestation and pairing approval — both require
 * fresh proof that the caller holds the wallet key.
 */
async function verifyWalletSignature(
  userId: number,
  message: string,
  nonce: unknown,
  signature: unknown,
): Promise<void> {
  if (typeof nonce !== "string" || nonce.length === 0) {
    throw new ValidationError("Invalid nonce")
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new ValidationError("Invalid signature")
  }

  const record = await db.query.walletNonces.findFirst({
    where: and(eq(walletNonces.nonce, nonce), eq(walletNonces.userId, userId)),
  })
  if (!record || record.expiresAt < new Date()) {
    throw new ValidationError("Invalid nonce")
  }

  const linked = await db
    .select({ address: addresses.address })
    .from(addresses)
    .where(eq(addresses.userId, userId))
  if (linked.length === 0) throw new ForbiddenError("device.no_wallet")

  let valid = false
  for (const { address } of linked) {
    const ok = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
    if (ok) {
      valid = true
      break
    }
  }
  if (!valid) throw new ForbiddenError("device.invalid_signature")

  await db.delete(walletNonces).where(eq(walletNonces.id, record.id))
}

devicesRouter.get(
  "/devices",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const rows = await db
      .select()
      .from(deviceSessions)
      .where(
        and(
          eq(deviceSessions.userId, auth.userId),
          isNull(deviceSessions.revokedAt),
        ),
      )
      .orderBy(desc(deviceSessions.lastSeenAt))

    res.json({
      devices: rows.map((d) => ({
        id: d.id,
        label: d.label,
        trusted: d.trustedAt != null,
        lastSeenAt: d.lastSeenAt,
        createdAt: d.createdAt,
        current: d.id === auth.sid,
      })),
    })
  }),
)

// Proves this device holds the wallet key by signing a server nonce, which
// marks the session trusted. The nonce comes from POST /wallet/nonce (shared
// with wallet linking). Trust is the prerequisite for approving pairings and
// (in a later step) gates the release of the encrypted backup.
devicesRouter.post(
  "/devices/attest",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "device-attest", 10, 60_000)

    const sid = auth.sid
    if (!sid) throw new ForbiddenError("device.no_session")

    const { nonce, signature } = req.body ?? {}
    await verifyWalletSignature(
      auth.userId,
      `Attest device ${sid} nonce ${nonce}`,
      nonce,
      signature,
    )
    await markSessionTrusted(sid)

    res.json({ ok: true, trusted: true })
  }),
)

// A pending (untrusted) device asks the account's trusted devices to approve
// releasing the encrypted backup to it. Idempotent: returns the existing
// pending request for this session if one is still live.
devicesRouter.post(
  "/devices/pairing-requests",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    if (!auth.sid) throw new ForbiddenError("device.no_session")
    if (req.deviceTrusted) throw new ValidationError("device.already_trusted")
    await rateLimitByUser(auth.userId, "device-pairing-request", 10, 60_000)

    const now = new Date()
    const existing = await db.query.devicePairingRequests.findFirst({
      where: and(
        eq(devicePairingRequests.sessionId, auth.sid),
        eq(devicePairingRequests.status, "pending"),
        gt(devicePairingRequests.expiresAt, now),
      ),
    })
    if (existing) {
      res.json({ pairingId: existing.id, expiresAt: existing.expiresAt })
      return
    }

    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS)
    const requestIp = getIp(req)
    const [row] = await db
      .insert(devicePairingRequests)
      .values({ userId: auth.userId, sessionId: auth.sid, requestIp, expiresAt })
      .returning()

    const session = await db.query.deviceSessions.findFirst({
      where: eq(deviceSessions.id, auth.sid),
    })
    emitDevicePairingRequested(auth.userId, {
      pairingId: row.id,
      sessionId: auth.sid,
      label: session?.label ?? "Unknown device",
      requestIp,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })

    res.json({ pairingId: row.id, expiresAt: row.expiresAt })
  }),
)

// A trusted device approves a pairing. Requires a fresh wallet-key signature
// (not just a trusted session) so a stolen session cookie alone cannot
// release the backup to a rogue device.
devicesRouter.post(
  "/devices/pairing-requests/:id/approve",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    if (!auth.sid || !req.deviceTrusted) {
      throw new ForbiddenError("device.not_trusted")
    }
    await rateLimitByUser(auth.userId, "device-pairing-approve", 10, 60_000)

    const pairing = await db.query.devicePairingRequests.findFirst({
      where: eq(devicePairingRequests.id, req.params.id),
    })
    if (!pairing || pairing.userId !== auth.userId) {
      throw new NotFoundError("pairing.not_found")
    }
    if (pairing.status !== "pending" || pairing.expiresAt < new Date()) {
      throw new ValidationError("pairing.not_pending")
    }

    const { nonce, signature } = req.body ?? {}
    await verifyWalletSignature(
      auth.userId,
      `Approve device pairing ${pairing.id} nonce ${nonce}`,
      nonce,
      signature,
    )

    await db
      .update(devicePairingRequests)
      .set({ status: "approved", approvedBySessionId: auth.sid })
      .where(eq(devicePairingRequests.id, pairing.id))

    emitDevicePairingApproved(auth.userId, { pairingId: pairing.id })

    res.json({ ok: true })
  }),
)

devicesRouter.post(
  "/devices/pairing-requests/:id/reject",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    if (!auth.sid || !req.deviceTrusted) {
      throw new ForbiddenError("device.not_trusted")
    }

    const pairing = await db.query.devicePairingRequests.findFirst({
      where: eq(devicePairingRequests.id, req.params.id),
    })
    if (!pairing || pairing.userId !== auth.userId) {
      throw new NotFoundError("pairing.not_found")
    }
    if (pairing.status !== "pending") {
      throw new ValidationError("pairing.not_pending")
    }

    await db
      .update(devicePairingRequests)
      .set({ status: "rejected" })
      .where(eq(devicePairingRequests.id, pairing.id))

    emitDevicePairingRejected(auth.userId, { pairingId: pairing.id })

    res.json({ ok: true })
  }),
)

// Rename a device label. Trusted-only (mismo bar que revoke): the default
// label is the User-Agent string and is unreadable without rename. The owner
// can rename any of their own sessions (including others), which makes the
// list usable on a phone where you can't see the UA otherwise.
devicesRouter.patch(
  "/devices/:sid",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    if (!req.deviceTrusted) throw new ForbiddenError("device.not_trusted")

    const raw = (req.body ?? {}).label
    if (typeof raw !== "string") throw new ValidationError("device.invalid_label")
    const label = raw.trim()
    if (label.length === 0 || label.length > LABEL_MAX) {
      throw new ValidationError("device.invalid_label")
    }

    const target = await db.query.deviceSessions.findFirst({
      where: eq(deviceSessions.id, req.params.sid),
    })
    if (!target || target.userId !== auth.userId) {
      throw new NotFoundError("device.not_found")
    }

    await db
      .update(deviceSessions)
      .set({ label })
      .where(eq(deviceSessions.id, target.id))

    emitDeviceListChanged(auth.userId)
    res.json({ ok: true })
  }),
)

devicesRouter.post(
  "/devices/:sid/revoke",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const targetSid = req.params.sid

    const target = await db.query.deviceSessions.findFirst({
      where: eq(deviceSessions.id, targetSid),
    })
    if (!target || target.userId !== auth.userId) {
      throw new NotFoundError("device.not_found")
    }

    if (target.revokedAt == null) {
      await revokeSession(targetSid)
      emitDeviceRevoked(auth.userId, targetSid)
      await disconnectSession(targetSid)
    }

    res.json({ ok: true })
  }),
)
