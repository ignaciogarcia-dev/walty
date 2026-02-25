"use client"
import { useRef } from "react"
import { useWallet } from "@/hooks/useWallet"
import { WalletView } from "@/components/WalletView"

export default function Dashboard() {
  const {
    status,
    password,
    setPassword,
    address,
    balance,
    create,
    unlock,
    lock,
    exportWallet,
    importWallet,
    send,
    txStatus,
    txHash,
    txError,
  } = useWallet()

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-imported if needed
    e.target.value = ""
    importWallet(file).catch((err) =>
      alert(err instanceof Error ? err.message : "Error al importar")
    )
  }

  if (status === "loading") return <div className="p-10">Cargando...</div>

  if (status === "new") {
    return (
      <div className="p-10 flex flex-col gap-2">
        <input
          type="password"
          placeholder="Password wallet"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={() => create(password)}>Crear wallet</button>
        <hr />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
        <button onClick={() => fileInputRef.current?.click()}>Importar backup</button>
      </div>
    )
  }

  if (status === "locked") {
    return (
      <div className="p-10 flex flex-col gap-2">
        <input
          type="password"
          placeholder="Password wallet"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={() => unlock(password).catch(() => alert("Password incorrecto"))}>
          Desbloquear
        </button>
        <hr />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
        <button onClick={() => fileInputRef.current?.click()}>Importar backup</button>
      </div>
    )
  }

  return (
    <WalletView
      address={address}
      balance={balance}
      onLock={lock}
      onExport={exportWallet}
      onSend={send}
      txStatus={txStatus}
      txHash={txHash}
      txError={txError}
    />
  )
}
