import { http } from "viem"

const RPCS = [
  process.env.NEXT_PUBLIC_RPC_URL!,
  "https://rpc.ankr.com/eth_sepolia",
  "https://ethereum-sepolia.publicnode.com",
]

export function getTransport() {
  const url = RPCS[Math.floor(Math.random() * RPCS.length)]
  return http(url)
}
