"use client"
import { useEffect, useState } from "react"
import type { TxStatus } from "@/hooks/useWallet"

const EXPLORER_BASE = "https://sepolia.etherscan.io/tx"

function ExplorerLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${EXPLORER_BASE}/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-mono break-all underline opacity-80 hover:opacity-100"
    >
      {hash.slice(0, 12)}…{hash.slice(-8)} (Etherscan)
    </a>
  )
}

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-middle mr-2" />
  )
}

export function WalletView({
  address,
  balance,
  onLock,
  onExport,
  onEstimateGas,
  onSend,
  txStatus,
  txHash,
  txError,
}: {
  address: string | null
  balance: string | null
  onLock: () => void
  onExport: () => void
  onEstimateGas: (to: string, amount: string) => Promise<string>
  onSend: (to: string, amount: string) => Promise<void>
  txStatus: TxStatus
  txHash: string | null
  txError: string | null
}) {
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")

  // 4.1 Confirm modal state
  const [showModal, setShowModal] = useState(false)
  const [gasEstimate, setGasEstimate] = useState<string | null>(null)
  const [gasError, setGasError] = useState<string | null>(null)

  useEffect(() => {
    if (txStatus === "confirmed") {
      setTo("")
      setAmount("")
    }
  }, [txStatus])

  async function handleOpenModal() {
    if (!to || !amount) return
    setGasEstimate(null)
    setGasError(null)
    setShowModal(true)
    try {
      const estimate = await onEstimateGas(to, amount)
      setGasEstimate(estimate)
    } catch {
      setGasError("No se pudo estimar el gas")
    }
  }

  function handleCancel() {
    setShowModal(false)
  }

  async function handleConfirm() {
    setShowModal(false)
    await onSend(to, amount)
  }

  const isBusy = txStatus === "pending"

  return (
    <div className="p-10 flex flex-col gap-4 max-w-lg">
      {/* 4.2 Network badge */}
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono font-semibold bg-amber-100 text-amber-800 w-fit">
        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
        Sepolia — TESTNET
      </div>

      <div className="font-mono text-sm break-all">Address: {address}</div>
      <div className="text-lg font-semibold">{balance ?? "..."} ETH</div>

      {/* Send form */}
      <div className="flex flex-col gap-2 mt-2">
        <input
          type="text"
          placeholder="Dirección destino (0x...)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border p-2 rounded font-mono text-sm"
        />
        <input
          type="text"
          placeholder="Cantidad (ETH)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border p-2 rounded"
        />
        <button onClick={handleOpenModal} disabled={isBusy || !to || !amount}>
          {isBusy ? (
            <>
              <Spinner />
              Enviando…
            </>
          ) : (
            "Enviar ETH"
          )}
        </button>
      </div>

      {/* 4.4 Transaction status */}
      {txStatus === "pending" && (
        <div className="flex flex-col gap-1 text-amber-700">
          <div className="flex items-center gap-1">
            <Spinner />
            Transacción pendiente…
          </div>
          {txHash && <ExplorerLink hash={txHash} />}
        </div>
      )}

      {txStatus === "pending_on_chain" && (
        <div className="flex flex-col gap-1 text-amber-600">
          <div className="flex items-center gap-1">
            <Spinner />
            En la red — esperando confirmación (puede demorar)
          </div>
          {txHash && <ExplorerLink hash={txHash} />}
        </div>
      )}

      {txStatus === "confirmed" && (
        <div className="flex flex-col gap-1 text-green-700">
          <div className="font-semibold">&#10003; Confirmada</div>
          {txHash && <ExplorerLink hash={txHash} />}
        </div>
      )}

      {txStatus === "error" && (
        <div className="flex flex-col gap-1 text-red-600">
          <div className="font-semibold">&#10007; Error</div>
          <div className="text-sm">{txError}</div>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button onClick={onExport}>Exportar backup</button>
        <button onClick={onLock}>Bloquear wallet</button>
      </div>

      {/* 4.1 Confirm modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 flex flex-col gap-3 shadow-xl">
            <h2 className="font-semibold text-lg">Confirmar transacción</h2>

            {/* 4.2 Network inside modal */}
            <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Sepolia — TESTNET
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-0.5">Destino</div>
              <div className="font-mono text-sm break-all">{to}</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-0.5">Monto</div>
              <div className="font-mono font-semibold">{amount} ETH</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-0.5">Gas estimado</div>
              {gasEstimate === null && !gasError ? (
                <div className="flex items-center gap-1 text-gray-500 text-sm">
                  <Spinner />
                  Calculando…
                </div>
              ) : gasError ? (
                <div className="text-red-500 text-sm">{gasError}</div>
              ) : (
                <div className="font-mono text-sm">~{gasEstimate} ETH</div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <button onClick={handleCancel} className="flex-1">
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={gasEstimate === null && !gasError}
                className="flex-1"
              >
                Confirmar envío
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
