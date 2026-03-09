const PUBLIC_RPC_URLS: Record<number, string> = {
  1: "https://ethereum.publicnode.com",
  42161: "https://arb1.arbitrum.io/rpc",
  8453: "https://mainnet.base.org",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
}

export function getPublicUrls(chainId: number): string[] {
  const url = PUBLIC_RPC_URLS[chainId]
  return url ? [url] : []
}
