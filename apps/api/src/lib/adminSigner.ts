/**
 * adminSigner.ts — viem wallet and public clients wired to the admin EOA.
 *
 * The admin EOA is derived from SAFE_DEPLOYER_PRIVATE_KEY and is the on-chain
 * owner of business Safes in stratum (a). Both clients use SAFE_RPC_URL when
 * set (e.g. a local anvil fork for integration tests) and fall back to the
 * public RPC for the chain.
 */

import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { getPublicRpcUrl } from "@walty/shared/providers/rpc/public"
import { getViemChain } from "@walty/shared/rpc/viemChains"
import { env } from "../config/env.js"
import { getAdminAddress } from "./safe.js"

function normalizedAdminKey(): `0x${string}` {
  const key = env.safeDeployerPrivateKey
  if (!key) throw new Error("safe-deployer-not-configured")
  return key.startsWith("0x") ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`)
}

function rpcUrl(chainId: number): string {
  return env.safeRpcUrl || getPublicRpcUrl(chainId)
}

/**
 * Returns a viem WalletClient whose account is the admin EOA, connected to
 * the given chain. Transport is SAFE_RPC_URL if set, otherwise the public RPC.
 */
export function getAdminWalletClient(chainId: number) {
  const account = privateKeyToAccount(normalizedAdminKey())
  const chain = getViemChain(chainId)
  return createWalletClient({
    account,
    chain,
    transport: http(rpcUrl(chainId)),
  })
}

/**
 * Returns a viem PublicClient on the same transport as the admin wallet client.
 * Used for `waitForTransactionReceipt` and contract reads in the service layer.
 */
export function getAdminPublicClient(chainId: number) {
  const chain = getViemChain(chainId)
  return createPublicClient({
    chain,
    transport: http(rpcUrl(chainId)),
  })
}

// Re-export so callers only need to import from here.
export { getAdminAddress }
