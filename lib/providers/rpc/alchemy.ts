const ALCHEMY_CHAIN_SLUGS: Record<number, string> = {
  1: "eth-mainnet",
  42161: "arb-mainnet",
  8453: "base-mainnet",
  10: "opt-mainnet",
  137: "polygon-mainnet",
}

export function getAlchemyUrls(chainId: number): string[] {
  const key = process.env.ALCHEMY_API_KEY
  const slug = ALCHEMY_CHAIN_SLUGS[chainId]
  if (!key || !slug) return []
  return [`https://${slug}.g.alchemy.com/v2/${key}`]
}
