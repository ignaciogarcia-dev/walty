import { parseEther, isAddress } from "viem"

export async function validateTx({
  to,
  amount,
  balance,
  address,
}: {
  to: string
  amount: string
  balance: bigint
  address: string
}) {
  if (!isAddress(to)) throw new Error("Invalid address")

  if (to.toLowerCase() === address.toLowerCase()) {
    throw new Error("Cannot send to yourself")
  }

  const value = parseEther(amount)

  if (value <= 0n) throw new Error("Invalid amount")

  if (balance < value) throw new Error("Insufficient funds")

  return value
}
