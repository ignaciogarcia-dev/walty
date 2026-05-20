import { and, desc, eq, isNull } from "drizzle-orm"
import { Router } from "express"
import { verifyMessage } from "viem"
import { db, addresses, deviceSessions, walletNonces } from "@walty/db"
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"
import {
  markSessionTrusted,
  revokeSession,
} from "../services/deviceSessions.js"
import { disconnectSession } from "../ws/io.js"

export const devicesRouter: Router = Router()

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
    await rateLimitByUser(auth.userId, 10, 60_000)

    const sid = auth.sid
    if (!sid) throw new ForbiddenError("device.no_session")

    const { nonce, signature } = req.body ?? {}
    if (typeof nonce !== "string" || nonce.length === 0) {
      throw new ValidationError("Invalid nonce")
    }
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new ValidationError("Invalid signature")
    }

    const record = await db.query.walletNonces.findFirst({
      where: and(
        eq(walletNonces.nonce, nonce),
        eq(walletNonces.userId, auth.userId),
      ),
    })
    if (!record || record.expiresAt < new Date()) {
      throw new ValidationError("Invalid nonce")
    }

    const linked = await db
      .select({ address: addresses.address })
      .from(addresses)
      .where(eq(addresses.userId, auth.userId))
    if (linked.length === 0) throw new ForbiddenError("device.no_wallet")

    const message = `Attest device ${sid} nonce ${nonce}`
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
    await markSessionTrusted(sid)

    res.json({ ok: true, trusted: true })
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
      await disconnectSession(targetSid)
    }

    res.json({ ok: true })
  }),
)
