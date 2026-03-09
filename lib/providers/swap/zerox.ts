import { getNetwork } from "@/lib/networks/networks"

const ZEROX_API_KEY = process.env.ZEROX_API_KEY ?? ""

// 0x v2 uses a sentinel address for native tokens (ETH/MATIC/etc.)
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

function toZeroxToken(addressOrSymbol: string | null): string {
  if (
    !addressOrSymbol ||
    addressOrSymbol === "ETH" ||
    addressOrSymbol === "MATIC"
  ) {
    return NATIVE
  }
  return addressOrSymbol
}

export type SwapPriceParams = {
  sellToken: string | null
  buyToken: string | null
  sellAmount: string
  chainId: number
}

export type SwapPrice = {
  buyAmount: string
  sellAmount: string
  liquidityAvailable?: boolean
}

export type SwapTransaction = {
  to: `0x${string}`
  data: `0x${string}`
  value: string
  gas: string
  gasPrice: string
}

export type SwapIssues = {
  allowance: { spender: `0x${string}`; currentAllowance: string } | null
  balance: { token: string; actual: string; expected: string } | null
}

export type SwapParams = {
  sellToken: string
  buyToken: string
  sellAmount: string
  takerAddress: string
  chainId: number
}

export type SwapQuote = SwapPrice & {
  transaction: SwapTransaction
  issues?: SwapIssues
  allowanceTarget?: `0x${string}`
  source: "0x" | "1inch"
}

export async function getPrice(params: SwapPriceParams): Promise<SwapPrice> {
  const network = getNetwork(params.chainId)
  const url = new URL(`${network.zeroxBaseUrl}/swap/allowance-holder/price`)
  url.searchParams.set("chainId", String(params.chainId))
  url.searchParams.set("sellToken", toZeroxToken(params.sellToken))
  url.searchParams.set("buyToken", toZeroxToken(params.buyToken))
  url.searchParams.set("sellAmount", params.sellAmount)

  const res = await fetch(url.toString(), {
    headers: { "0x-api-key": ZEROX_API_KEY, "0x-version": "v2" },
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>
    throw new Error(
      err.reason ?? err.message ?? `0x price error: ${res.status}`
    )
  }

  return res.json()
}

export async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
  const network = getNetwork(params.chainId)
  const url = new URL(`${network.zeroxBaseUrl}/swap/allowance-holder/quote`)
  url.searchParams.set("chainId", String(params.chainId))
  url.searchParams.set("sellToken", toZeroxToken(params.sellToken))
  url.searchParams.set("buyToken", toZeroxToken(params.buyToken))
  url.searchParams.set("sellAmount", params.sellAmount)
  url.searchParams.set("taker", params.takerAddress)

  const res = await fetch(url.toString(), {
    headers: { "0x-api-key": ZEROX_API_KEY, "0x-version": "v2" },
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>
    throw new Error(
      err.reason ?? err.message ?? `0x quote error: ${res.status}`
    )
  }

  const data = await res.json()
  return { ...data, source: "0x" as const }
}
