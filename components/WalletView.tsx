"use client"
import { useEffect, useState } from "react"
import type { TxStatus } from "@/hooks/useWallet"

const EXPLORER_BASE = "https://sepolia.etherscan.io/tx"

export function WalletView({
  address,
  balance,
  onLock,
  onExport,
  onSend,
  txStatus,
  txHash,
  txError,
}: {
  address: string | null
  balance: string | null
  onLock: () => void
  onExport: () => void
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
    const ok = window.confirm(`Enviar ${amount} ETH a:\n${to}\n\n¿Continuar?`)
    if (!ok) return
    await onSend(to, amount)
  }

  const isPending = txStatus === "pending"

  return (
    <div className="p-10 flex flex-col gap-4">
      <div className="text-xs font-mono text-gray-500">Network: Sepolia</div>
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
        <button onClick={handleSend} disabled={isPending}>
          {isPending ? "Enviando..." : "Enviar ETH"}
        </button>
      </div>

      {txStatus === "pending" && (
        <div className="mt-2 text-yellow-600">
          <div>Transacción pendiente...</div>
          {txHash && (
            <a
              href={`${EXPLORER_BASE}/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs break-all mt-1 underline"
            >
              {txHash}
            </a>
          )}
        </div>
      )}

      {txStatus === "pending_on_chain" && (
        <div className="mt-2 text-yellow-500">
          <div>Tx enviada — sin confirmación aún (puede demorar)</div>
          {txHash && (
            <a
              href={`${EXPLORER_BASE}/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs break-all mt-1 underline"
            >
              Ver en Etherscan
            </a>
          )}
        </div>
      )}

      {txStatus === "confirmed" && (
        <div className="mt-2 text-green-600">
          <div>Confirmada</div>
          {txHash && (
            <a
              href={`${EXPLORER_BASE}/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs break-all mt-1 underline"
            >
              Ver en Etherscan
            </a>
          )}
        </div>
      )}

      {txStatus === "error" && (
        <div className="mt-2 text-red-600">
          Error: {txError}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onExport}>Exportar backup</button>
        <button onClick={onLock}>Bloquear wallet</button>
      </div>
    </div>
  )
}
