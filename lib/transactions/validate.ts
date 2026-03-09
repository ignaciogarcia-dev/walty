import { parseUnits, isAddress } from "viem"
import type { Token } from "@/lib/tokens/tokenRegistry"

export async function validateTx({
  to,
  amount,
  balance,
  address,
  token,
}: {
  to: string
  amount: string
  balance: bigint
  address: string
  token: Token
}) {
  if (!isAddress(to)) throw new Error("Invalid address")

  if (to.toLowerCase() === address.toLowerCase()) {
    throw new Error("Cannot send to yourself")
  }

  const value = parseUnits(amount, token.decimals)

  if (value <= 0n) throw new Error("Invalid amount")

  if (balance < value) throw new Error("Insufficient funds")

  return value
}
