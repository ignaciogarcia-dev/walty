import { parseEther, isAddress } from "viem"
import type { getWalletClient } from "@/lib/signer"
import { publicClient } from "@/lib/eth"

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

export async function sendTx(
  walletClient: ReturnType<typeof getWalletClient>,
  to: string,
  amount: string
) {
  const hash = await walletClient.sendTransaction({
    to: to as `0x${string}`,
    value: parseEther(amount),
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  return { hash, receipt }
}
