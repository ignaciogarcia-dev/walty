import Safe, { type PredictedSafeProps } from "@safe-global/protocol-kit"
import { getPublicRpcUrl } from "@walty/shared/providers/rpc/public"
import { getViemChain } from "@walty/shared/rpc/viemChains"
import { waitForTransactionReceipt } from "viem/actions"

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

  await waitForTransactionReceipt(client, { hash: txHash })

  return { safeAddress, txHash }
}
