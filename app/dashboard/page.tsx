"use client"
import { useWallet } from "@/hooks/useWallet"
import { WalletView } from "@/components/WalletView"

export default function Dashboard() {
  const { status, password, setPassword, address, balance, create, unlock, lock } = useWallet()

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
      </div>
    )
  }

  return <WalletView address={address} balance={balance} onLock={lock} />
}
