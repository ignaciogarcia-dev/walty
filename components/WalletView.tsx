"use client"
import { useState } from "react"

export function WalletView({
  address,
  balance,
  onLock,
  onSend,
}: {
  address: string | null
  balance: string | null
  onLock: () => void
  onSend: (to: string, amount: string) => Promise<string>
}) {
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (!to || !amount) return
    setSending(true)
    try {
      const hash = await onSend(to, amount)
      alert("TX enviada: " + hash)
      setTo("")
      setAmount("")
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSending(false)
    }
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
        <button onClick={handleSend} disabled={sending}>
          {sending ? "Enviando..." : "Enviar ETH"}
        </button>
      </div>

      <button onClick={onLock}>Bloquear wallet</button>
    </div>
  )
}
