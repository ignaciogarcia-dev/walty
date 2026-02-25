"use client"
import { useState } from "react"
import { useWallet } from "@/hooks/useWallet"

export default function Dashboard() {
  const [password, setPassword] = useState("")
  const { status, address, balance, pendingMnemonic, create, confirmBackup, unlock, lock } = useWallet()

  async function handleCreate() {
    if (!password) {
      alert("Password requerido")
      return
    }
    await create(password)
    setPassword("")
  }

  async function handleUnlock() {
    try {
      await unlock(password)
      setPassword("")
    } catch {
      alert("Password incorrecto")
    }
  }

  if (status === "loading") {
    return <div className="p-10">Cargando...</div>
  }

  if (status === "new") {
    return (
      <div className="p-10 flex flex-col gap-2">
        <p>Creá tu wallet</p>
        <input
          type="password"
          placeholder="Contraseña para tu wallet"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleCreate}>Crear wallet</button>
      </div>
    )
  }

  if (status === "backup") {
    return (
      <div className="p-10 flex flex-col gap-4">
        <p>⚠️ Guardá tu seed phrase. No la vas a poder recuperar.</p>
        <pre className="bg-gray-100 p-4 rounded text-sm break-all">{pendingMnemonic}</pre>
        <button onClick={confirmBackup}>Guardé mi seed, continuar</button>
      </div>
    )
  }

  if (status === "locked") {
    return (
      <div className="p-10 flex flex-col gap-2">
        <p>Desbloqueá tu wallet</p>
        <input
          type="password"
          placeholder="Contraseña de tu wallet"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleUnlock}>Desbloquear</button>
      </div>
    )
  }

  return (
    <div className="p-10 flex flex-col gap-2">
      <div>Address: {address}</div>
      <div>Balance: {balance ?? "Cargando..."} ETH</div>
      <button onClick={lock}>Bloquear wallet</button>
    </div>
  )
}
