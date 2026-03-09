import type { SwapParams, SwapQuote } from "./zerox"

const ONEINCH_API_KEY = process.env.ONEINCH_API_KEY ?? ""

// 1inch swap stub — same interface as zerox for interchangeability
// Endpoint: https://api.1inch.dev/swap/v6.0/{chainId}/quote
// Requires ONEINCH_API_KEY
export async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
  if (!ONEINCH_API_KEY) {
    throw new Error("1inch API key not configured")
  }

  const url = new URL(
    `https://api.1inch.dev/swap/v6.0/${params.chainId}/quote`
  )
  url.searchParams.set("src", params.sellToken)
  url.searchParams.set("dst", params.buyToken)
  url.searchParams.set("amount", params.sellAmount)
  url.searchParams.set("from", params.takerAddress)

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ONEINCH_API_KEY}`,
      Accept: "application/json",
    },
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>
    throw new Error(
      err.description ?? err.message ?? `1inch quote error: ${res.status}`
    )
  }

  const data = await res.json()

  // Map 1inch response to SwapQuote format
  return {
    buyAmount: data.dstAmount ?? data.toAmount ?? "0",
    sellAmount: params.sellAmount,
    transaction: {
      to: data.tx?.to ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`),
      data: data.tx?.data ?? ("0x" as `0x${string}`),
      value: data.tx?.value ?? "0",
      gas: data.tx?.gas ?? data.estimatedGas ?? "0",
      gasPrice: data.tx?.gasPrice ?? "0",
    },
    source: "1inch" as const,
  }
}
