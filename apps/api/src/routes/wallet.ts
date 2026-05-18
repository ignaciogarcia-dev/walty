import { randomBytes } from "node:crypto"
import { and, eq, lt } from "drizzle-orm"
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
import { asyncHandler } from "../middleware/asyncHandler.js"
import { withAuth } from "../middleware/withAuth.js"

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
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    await rateLimitByUser(auth.userId, 5, 60_000)

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
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    await rateLimitByUser(auth.userId, 3, 60_000)

    const { address, signature, nonce } = req.body ?? {}

    if (!address || !isAddress(address)) {
      throw new ValidationError("Invalid address")
    }
    if (typeof signature !== "string" || !signature.startsWith("0x")) {
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
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    await rateLimitByUser(auth.userId, 5, 60_000)

    const backup = await db.query.walletBackups.findFirst({
      where: eq(walletBackups.userId, auth.userId),
    })

    res.json(backup ? backup.data : null)
  }),
)

walletRouter.post(
  "/wallet/backup",
  withAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    await rateLimitByUser(auth.userId, 5, 60_000)

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
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    await rateLimitByUser(auth.userId, 20, 60_000)

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
  "/addresses",
  withAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    const result = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, auth.userId))
    res.json({ addresses: result })
  }),
)
