import { http, fallback } from "viem"

export function getTransport() {
  const rpcs = [
    process.env.NEXT_PUBLIC_RPC_URL,
    "https://rpc.ankr.com/eth_sepolia",
    "https://ethereum-sepolia.publicnode.com",
  ].filter(Boolean) as string[]

  return fallback(rpcs.map((url) => http(url)))
}
