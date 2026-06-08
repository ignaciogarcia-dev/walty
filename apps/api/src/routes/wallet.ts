import { randomBytes } from "node:crypto"
import { and, eq, gt, lt } from "drizzle-orm"
import { Router } from "express"
import {
  decodeFunctionResult,
  encodeFunctionData,
  isAddress,
  verifyMessage,
} from "viem"
import {
  db,
  addresses,
  devicePairingRequests,
  mpcKeys,
  mpcServerShares,
  walletBackups,
  walletNonces,
} from "@walty/db"
import {
  ForbiddenError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import { getPublicClient } from "@walty/shared/rpc/getPublicClient"
import { validateBackup as validateBackupShape } from "@walty/shared/wallet-backup/validation"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"
import { loadServerKeyshare, runLocalRecover } from "../services/mpc/MpcServerParty.js"
import { encryptShare } from "../services/mpc/serverShareStore.js"
import { stageRecovery, takeRecovery, markConsumed } from "../services/mpc/recoverStaging.js"

export const walletRouter: Router = Router()

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

walletRouter.post(
  "/wallet/nonce",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "wallet-nonce", 5, 60_000)

    await db.delete(walletNonces).where(lt(walletNonces.expiresAt, new Date()))

    const nonce = randomBytes(16).toString("hex")
    await db.insert(walletNonces).values({
      userId: auth.userId,
      nonce,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    })

    res.json({ nonce })
  }),
)

walletRouter.post(
  "/wallet/link",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "wallet-link", 3, 60_000)

    const { address, signature, nonce } = req.body ?? {}

    if (!address || !isAddress(address)) {
      throw new ValidationError("Invalid address")
    }
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new ValidationError("Invalid signature")
    }
    if (typeof nonce !== "string" || nonce.length === 0) {
      throw new ValidationError("Invalid nonce")
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

    const message = `Link wallet ${address} nonce ${nonce}`
    const valid = await verifyMessage({
      address,
      message,
      signature: signature as `0x${string}`,
    })
    if (!valid) throw new ForbiddenError("wallet.invalid_signature")

    await db.delete(walletNonces).where(eq(walletNonces.id, record.id))
    await db.insert(addresses).values({ userId: auth.userId, address })

    res.json({ ok: true })
  }),
)

walletRouter.get(
  "/wallet/backup",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "wallet-backup-read", 5, 60_000)

    // Releasing the encrypted backup to a device that has no seed is the one
    // gated step of multi-device. A trusted device (it proved it holds the
    // wallet key) is always allowed; an untrusted one needs a live approved
    // pairing from a trusted device.
    if (!req.deviceTrusted) {
      const sid = auth.sid
      const approved = sid
        ? await db.query.devicePairingRequests.findFirst({
            where: and(
              eq(devicePairingRequests.sessionId, sid),
              eq(devicePairingRequests.status, "approved"),
              gt(devicePairingRequests.expiresAt, new Date()),
            ),
          })
        : null
      if (!approved) throw new ForbiddenError("pairing-required")
    }

    const backup = await db.query.walletBackups.findFirst({
      where: eq(walletBackups.userId, auth.userId),
    })

    res.json(backup ? backup.data : null)
  }),
)

walletRouter.post(
  "/wallet/backup",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "wallet-backup-write", 5, 60_000)

    const body = req.body
    try {
      validateBackupShape(body)
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : "Invalid backup")
    }

    await db
      .insert(walletBackups)
      .values({ userId: auth.userId, data: body, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: walletBackups.userId,
        set: { data: body, updatedAt: new Date() },
      })

    res.json({ success: true })
  }),
)

walletRouter.get(
  "/wallet/balance",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "wallet-balance", 20, 60_000)

    const address = typeof req.query.address === "string" ? req.query.address : null
    const tokenAddress =
      typeof req.query.tokenAddress === "string" ? req.query.tokenAddress : null
    const chainId = Number(req.query.chainId ?? 137)

    if (!address || !isAddress(address)) throw new ValidationError("Invalid address")
    if (!tokenAddress || !isAddress(tokenAddress)) {
      throw new ValidationError("Invalid tokenAddress")
    }

    const client = getPublicClient(chainId)
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    })
    const result = await client.call({
      to: tokenAddress as `0x${string}`,
      data,
    })
    if (!result.data) throw new ValidationError("Empty response from contract")

    const balance = decodeFunctionResult({
      abi: ERC20_ABI,
      functionName: "balanceOf",
      data: result.data,
    })

    res.json({ balance: balance.toString(), chainId })
  }),
)

walletRouter.get(
  "/mpc-key",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const key = await db.query.mpcKeys.findFirst({
      where: eq(mpcKeys.userId, auth.userId),
    })
    res.json({ keyId: key?.id ?? null, address: key?.address ?? null })
  }),
)

walletRouter.get(
  "/addresses",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const result = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, auth.userId))
    res.json({ addresses: result })
  }),
)

// Server-side MPC recovery: runs all three DKLS parties locally (node WASM only)
// to avoid the web→node WASM incompatibility in initLostShareRecovery round 2.
// The server transiently holds all three shares during recovery.
walletRouter.post(
  "/mpc-recover",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "mpc-recover", 20, 3_600_000)

    const { backupShare, generation } = req.body ?? {}
    if (typeof backupShare !== "string" || !backupShare) {
      throw new ValidationError("Missing backupShare")
    }

    const backupShareBytes = Buffer.from(backupShare, "base64")

    const keyRow = await db.query.mpcKeys.findFirst({
      where: eq(mpcKeys.userId, auth.userId),
    })
    if (!keyRow) throw new ValidationError("No MPC key found for this user")

    // A v2 kit carries the polynomial generation it was minted at. Every
    // refresh/recover advances mpc_keys.version; a kit from an older generation
    // can never recombine with the current server share (DKLS "Invalid key
    // refresh"). Reject it up front with an actionable error instead of running
    // the doomed ceremony. (Legacy v1 kits send no generation — see the catch
    // below, which maps the WASM failure to the same outcome.)
    if (typeof generation === "number" && generation !== keyRow.version) {
      throw new ValidationError("recovery_kit_outdated")
    }

    const { keyshareBytes: serverShareBytes, ctx } = await loadServerKeyshare(keyRow.id)

    let recovered: Awaited<ReturnType<typeof runLocalRecover>>
    try {
      recovered = await runLocalRecover(serverShareBytes, backupShareBytes)
    } catch (err) {
      // DKLS throws this when the two surviving shares are from different
      // polynomial generations — i.e. the uploaded kit is stale.
      if (err instanceof Error && /invalid key refresh/i.test(err.message)) {
        throw new ValidationError("recovery_kit_outdated")
      }
      throw err
    }
    const { newDeviceShareBytes, newServerShareBytes, newBackupShareBytes, pubkey, address } =
      recovered

    // Recovery re-randomised all three shares onto the next polynomial generation.
    // DO NOT overwrite the live server share yet: stage it (ack-then-commit) and
    // leave the DB at gen N. The old kit + gen-N share stay a valid recovery pair
    // until the client confirms it saved the new device share AND downloaded the
    // re-issued kit (gen N+1) by calling /mpc-recover/commit. An abandoned flow is
    // then retryable, never bricking.
    const nextVersion = keyRow.version + 1
    const enc = await encryptShare({ ...ctx, version: nextVersion }, newServerShareBytes)
    const commitToken = stageRecovery(auth.userId, keyRow.id, enc, nextVersion)

    res.json({
      keyId: keyRow.id,
      deviceShare: newDeviceShareBytes.toString("base64"),
      // The refreshed backup share — the client MUST re-export it into a fresh
      // kit (generation = nextVersion); the uploaded kit is now stale.
      backupShare: newBackupShareBytes.toString("base64"),
      generation: nextVersion,
      commitToken,
      pubkey,
      address,
    })
  }),
)

// Commit phase of the ack-then-commit recovery: the client calls this only after
// it has durably saved the new device share and downloaded the re-issued kit.
// Only here do we overwrite the live server share + bump the key version.
walletRouter.post(
  "/mpc-recover/commit",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "mpc-recover-commit", 40, 3_600_000)

    const { commitToken } = req.body ?? {}
    if (typeof commitToken !== "string" || !commitToken) {
      throw new ValidationError("Missing commitToken")
    }

    const result = takeRecovery(auth.userId, commitToken)
    if (result.status === "not_found") {
      // Expired/unknown token — nothing was committed, the live share is still at
      // the old generation, so the user's previous kit remains valid for a retry.
      throw new ValidationError("recovery_session_expired")
    }
    if (result.status === "already_committed") {
      res.json({ ok: true, alreadyCommitted: true })
      return
    }

    const { staged } = result
    const baseVersion = staged.nextVersion - 1

    // Conditional on the key still being at the base generation. If another
    // recovery already advanced it (concurrent/duplicate commit), this affects 0
    // rows: we must NOT install a server share that no longer matches the kit +
    // device the user kept. Bail without writing — the live share stays valid for
    // a fresh recovery.
    const bumped = await db
      .update(mpcKeys)
      .set({ version: staged.nextVersion })
      .where(and(eq(mpcKeys.id, staged.keyId), eq(mpcKeys.version, baseVersion)))
      .returning({ id: mpcKeys.id })
    if (bumped.length !== 1) {
      throw new ValidationError("recovery_session_expired")
    }
    await db
      .update(mpcServerShares)
      .set({
        ciphertext: staged.enc.ciphertext,
        nonce: staged.enc.nonce,
        wrappedDek: staged.enc.wrappedDek,
        version: staged.enc.version,
      })
      .where(eq(mpcServerShares.keyId, staged.keyId))
    markConsumed(commitToken)

    res.json({ ok: true, generation: staged.nextVersion })
  }),
)
