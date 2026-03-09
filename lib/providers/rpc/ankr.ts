const ANKR_SLUGS: Record<number, string> = {
  1: "eth",
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
  137: "polygon",
}

export function getAnkrUrls(chainId: number): string[] {
  const key = process.env.ANKR_API_KEY
  if (!key) return []
  const slug = ANKR_SLUGS[chainId]
  return slug ? [`https://rpc.ankr.com/${slug}/${key}`] : []
}
