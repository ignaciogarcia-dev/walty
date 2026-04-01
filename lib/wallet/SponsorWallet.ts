/**
 * SponsorWallet.ts
 *
 * SERVER-SIDE ONLY — never import from client code.
 *
 * Exposes the sponsor (relayer) wallet that pays MATIC gas for gasless transfers.
 * Uses the same Alchemy/Ankr/public RPC fallback stack as the rest of the project.
 *
 * Required env vars:
 *   SPONSOR_PRIVATE_KEY       — hex private key (0x…), never NEXT_PUBLIC_
 *   NEXT_PUBLIC_FEE_BPS       — fee in basis points, e.g. 100 = 1%
 *   NEXT_PUBLIC_FEE_RECIPIENT — address that receives the fee
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  type Address,
  type WalletClient,
  type PublicClient,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { getViemChain } from "@/lib/rpc/viemChains"
import { getAlchemyUrls } from "@/lib/providers/rpc/alchemy"
import { getAnkrUrls } from "@/lib/providers/rpc/ankr"
import { getPublicUrls } from "@/lib/providers/rpc/public"

// ── Singletons ────────────────────────────────────────────────────────────────

// Sponsor always operates on Polygon (chainId 137) for gas payments.
// The public client cache covers any chain used to wait for receipts.
let _walletClient: WalletClient | null = null
const _publicClients = new Map<number, PublicClient>()

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Returns the singleton sponsor WalletClient.
 * Reads SPONSOR_PRIVATE_KEY from env — throws if missing.
 */
export function getSponsorWalletClient(): WalletClient {
  if (_walletClient) return _walletClient

  const privateKey = process.env.SPONSOR_PRIVATE_KEY
  if (!privateKey) throw new Error("Missing required env var: SPONSOR_PRIVATE_KEY")

  const account  = privateKeyToAccount(privateKey as `0x${string}`)
  const chainId  = 137 // Polygon
  const rpcUrls  = [
    ...getAlchemyUrls(chainId),
    ...getAnkrUrls(chainId),
    ...getPublicUrls(chainId),
  ]

  _walletClient = createWalletClient({
    account,
    chain:     getViemChain(chainId),
    transport: fallback(
      rpcUrls.map((url) => http(url, { timeout: 10_000 })),
      { retryCount: 2 },
    ),
  })

  return _walletClient
}

/**
 * Returns a cached PublicClient for the given chainId.
 * Used to wait for transaction receipts after the sponsor broadcasts.
 */
export function getSponsorPublicClient(chainId: number): PublicClient {
  if (_publicClients.has(chainId)) return _publicClients.get(chainId)!

  const rpcUrls = [
    ...getAlchemyUrls(chainId),
    ...getAnkrUrls(chainId),
    ...getPublicUrls(chainId),
  ]

  const client = createPublicClient({
    chain:     getViemChain(chainId),
    transport: fallback(
      rpcUrls.map((url) => http(url, { timeout: 10_000 })),
      { rank: false, retryCount: 2 },
    ),
  })

  _publicClients.set(chainId, client)
  return client
}

/**
 * Returns the fee configuration from server env vars.
 * feeBps and feeRecipient are always read server-side — never from the request.
 */
export function getFeeConfig(): { feeBps: number; feeRecipient: Address } {
  const rawBps = process.env.NEXT_PUBLIC_FEE_BPS
  if (!rawBps) throw new Error("Missing required env var: NEXT_PUBLIC_FEE_BPS")

  const feeBps = parseInt(rawBps, 10)
  if (isNaN(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error(`Invalid NEXT_PUBLIC_FEE_BPS: "${rawBps}" (must be 0–10000)`)
  }

  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT
  if (!feeRecipient) throw new Error("Missing required env var: NEXT_PUBLIC_FEE_RECIPIENT")

  return { feeBps, feeRecipient: feeRecipient as Address }
}
