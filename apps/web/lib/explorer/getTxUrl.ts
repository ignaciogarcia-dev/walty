import { getNetwork } from "@walty/shared/networks/networks"

export function getTxUrl(hash: string, chainId: number): string {
  return `${getNetwork(chainId).explorer}/tx/${hash}`
}
