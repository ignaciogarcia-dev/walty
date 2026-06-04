import Safe, { type PredictedSafeProps } from "@safe-global/protocol-kit"
import { getPublicRpcUrl } from "@walty/shared/providers/rpc/public"
import { getViemChain } from "@walty/shared/rpc/viemChains"
import { privateKeyToAccount } from "viem/accounts"
import { waitForTransactionReceipt } from "viem/actions"
import { env } from "../config/env.js"

/**
 * Returns the on-chain address of the server-controlled admin EOA derived from
 * SAFE_DEPLOYER_PRIVATE_KEY. This address is used as the Safe owner in
 * stratum (a); it will be swapped for the MPC/user key in a later stratum.
 */
export function getAdminAddress(): `0x${string}` {
  const key = env.safeDeployerPrivateKey
  if (!key) throw new Error("safe-deployer-not-configured")
  const normalized: `0x${string}` = key.startsWith("0x")
    ? (key as `0x${string}`)
    : `0x${key}`
  return privateKeyToAccount(normalized).address as `0x${string}`
}

interface PredictArgs {
  ownerAddress: string
  chainId: number
  saltNonce: string
}

interface DeployArgs extends PredictArgs {
  deployerPrivateKey: string
}

function buildPredictedSafe(ownerAddress: string, saltNonce: string): PredictedSafeProps {
  return {
    safeAccountConfig: { owners: [ownerAddress], threshold: 1 },
    safeDeploymentConfig: { saltNonce, safeVersion: "1.4.1" },
  }
}

export async function predictSafeAddress(args: PredictArgs): Promise<string> {
  const protocolKit = await Safe.init({
    provider: getPublicRpcUrl(args.chainId),
    predictedSafe: buildPredictedSafe(args.ownerAddress, args.saltNonce),
  })
  return protocolKit.getAddress()
}

export async function deploySafe(
  args: DeployArgs,
): Promise<{ safeAddress: string; txHash: string }> {
  const protocolKit = await Safe.init({
    provider: getPublicRpcUrl(args.chainId),
    signer: args.deployerPrivateKey,
    predictedSafe: buildPredictedSafe(args.ownerAddress, args.saltNonce),
  })

  const safeAddress = await protocolKit.getAddress()
  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()
  const client = await protocolKit.getSafeProvider().getExternalSigner()
  if (!client) throw new Error("No external signer available — check deployerPrivateKey")

  const chain = getViemChain(args.chainId)
  const txHash = await client.sendTransaction({
    to: deploymentTransaction.to as `0x${string}`,
    value: BigInt(deploymentTransaction.value),
    data: deploymentTransaction.data as `0x${string}`,
    chain,
  })

  const receipt = await waitForTransactionReceipt(client, { hash: txHash })
  if (receipt.status === "reverted") {
    throw new Error(`Safe deployment tx reverted: ${txHash}`)
  }

  return { safeAddress, txHash }
}
