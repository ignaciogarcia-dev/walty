"use client"
import { useRef, useState, useEffect } from "react"
import { useWallet } from "@/hooks/useWallet"
import { WalletView } from "@/components/WalletView"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeSelector } from "@/components/theme/selector"
import { LocaleSelector } from "@/components/locale/selector"
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
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Clear errors when status changes
  useEffect(() => {
    if (status !== "locked") {
      setUnlockError(null)
    }
    if (status !== "new") {
      setCreateError(null)
    }
    // Clear import error when status changes
    setImportError(null)
  }, [status])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImportError(null)
    try {
      await importWallet(file)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Error al importar backup")
    }
  }

  const handleCreate = async () => {
    if (password.length < 8) {
      setCreateError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    setCreateError(null)
    try {
      await create(password)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Error al crear wallet")
    }
  }

  const handleUnlock = async () => {
    setUnlockError(null)
    try {
      await unlock(password)
      setUnlockError(null) // Clear error on success
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Contraseña incorrecta")
    }
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
            <h2 className="text-lg font-semibold text-foreground">Crear wallet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea una contraseña para proteger tu wallet. Esta contraseña es <strong>diferente</strong> de la contraseña de tu cuenta y se usará para encriptar tu seed localmente.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Contraseña de la wallet</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (createError) setCreateError(null)
              }}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                password.length >= 8 &&
                handleCreate()
              }
              autoComplete="new-password"
            />
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Idioma</Label>
            <LocaleSelector />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tema</Label>
            <ThemeSelector />
          </div>

          <Button
            onClick={handleCreate}
            disabled={password.length < 8}
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
          {importError && (
            <p className="text-xs text-destructive text-center">{importError}</p>
          )}
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
            <p className="mt-1 text-sm text-muted-foreground">
              Ingresa la contraseña de tu wallet para desbloquear. Esta es la contraseña que configuraste al crear la wallet.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unlock-password">Contraseña de la wallet</Label>
            <Input
              id="unlock-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (unlockError) setUnlockError(null)
              }}
              onKeyDown={(e) => e.key === "Enter" && password && handleUnlock()}
              autoComplete="current-password"
            />
            {unlockError && (
              <p className="text-xs text-destructive">{unlockError}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Idioma</Label>
            <LocaleSelector />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tema</Label>
            <ThemeSelector />
          </div>

          <Button
            onClick={handleUnlock}
            disabled={!password}
            className="w-full"
          >
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
          {importError && (
            <p className="text-xs text-destructive text-center">{importError}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </div>
        <div className="flex-1 overflow-auto">
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
