"use client"
import { useRef } from "react"
import { useWallet } from "@/hooks/useWallet"
import { WalletView } from "@/components/WalletView"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

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
    estimateGasCost,
    send,
    txStatus,
    txHash,
    txError,
    resetTx,
    txHistory,
  } = useWallet()

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    importWallet(file).catch((err) =>
      alert(err instanceof Error ? err.message : "Error al importar")
    )
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner className="size-6" />
          <span className="text-sm">Cargando…</span>
        </div>
      </div>
    )
  }

  if (status === "new") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Nueva wallet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea una contraseña para cifrar tu seed localmente.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Contraseña</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                create(password).catch((err) => alert(err instanceof Error ? err.message : "Error al crear"))
              }
              autoComplete="new-password"
            />
          </div>

          <Button
            onClick={() =>
              create(password).catch((err) => alert(err instanceof Error ? err.message : "Error al crear wallet"))
            }
            className="w-full"
          >
            Crear wallet
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">o</span>
            <Separator className="flex-1" />
          </div>

          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
            Importar backup
          </Button>
        </div>
      </div>
    )
  }

  if (status === "locked") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Wallet bloqueada</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ingresa tu contraseña para desbloquear.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unlock-password">Contraseña</Label>
            <Input
              id="unlock-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock(password).catch(() => alert("Password incorrecto"))}
              autoComplete="current-password"
            />
          </div>

          <Button onClick={() => unlock(password).catch(() => alert("Password incorrecto"))} className="w-full">
            Desbloquear
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">o</span>
            <Separator className="flex-1" />
          </div>

          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
            Importar backup
          </Button>
        </div>
      </div>
    )
  }

  return (
    <WalletView
      address={address}
      balance={balance}
      onLock={lock}
      onExport={exportWallet}
      onEstimateGas={estimateGasCost}
      onSend={send}
      onResetTx={resetTx}
      txStatus={txStatus}
      txHash={txHash}
      txError={txError}
      txHistory={txHistory}
    />
  )
}
