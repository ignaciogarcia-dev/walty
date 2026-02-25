"use client"
import { useEffect, useState } from "react"
import type { TxStatus } from "@/hooks/useWallet"

export function WalletView({
  address,
  balance,
  onLock,
  onSend,
  txStatus,
  txHash,
  txError,
}: {
  address: string | null
  balance: string | null
  onLock: () => void
  onSend: (to: string, amount: string) => Promise<void>
  txStatus: TxStatus
  txHash: string | null
  txError: string | null
}) {
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")

  useEffect(() => {
    if (txStatus === "confirmed") {
      setTo("")
      setAmount("")
    }
  }, [txStatus])

  async function handleSend() {
    if (!to || !amount) return
    await onSend(to, amount)
  }

  return (
    <div className="p-10 flex flex-col gap-4">
      <div>Address: {address}</div>
      <div>Balance: {balance ?? "Cargando..."} ETH</div>

      <div className="flex flex-col gap-2 mt-4">
        <input
          type="text"
          placeholder="Dirección destino (0x...)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border p-2 rounded"
        />
        <input
          type="text"
          placeholder="Cantidad (ETH)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border p-2 rounded"
        />
        <button onClick={handleSend} disabled={txStatus === "pending"}>
          {txStatus === "pending" ? "Enviando..." : "Enviar ETH"}
        </button>
      </div>

      {txStatus === "pending" && (
        <div className="mt-2 text-yellow-600">
          <div>Transacción pendiente...</div>
          {txHash && <div className="text-xs break-all mt-1">Hash: {txHash}</div>}
        </div>
      )}

      {txStatus === "confirmed" && (
        <div className="mt-2 text-green-600">
          <div>Confirmada</div>
          {txHash && <div className="text-xs break-all mt-1">Hash: {txHash}</div>}
        </div>
      )}

      {txStatus === "error" && (
        <div className="mt-2 text-red-600">
          Error: {txError}
        </div>
      )}

      <button onClick={onLock}>Bloquear wallet</button>
    </div>
  )
}
