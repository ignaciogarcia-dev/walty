"use client"

import { useState } from "react"
import { Check, CopySimple, X } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { copyToClipboard } from "@/utils/copyToClipboard"
import { cn } from "@/utils/style"
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/primitives/dialog"

type Role = "manager" | "cashier" | "waiter"

const ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: "manager",
    label: "Gerente",
    description: "Puede generar cobros, ver reportes y solicitar reembolsos",
  },
  {
    value: "cashier",
    label: "Cajero",
    description: "Puede generar cobros y confirmar pagos",
  },
  {
    value: "waiter",
    label: "Mozo",
    description: "Puede generar cobros QR y ver el estado del pago",
  },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInviteCreated?: () => void
}

export function InviteModal({ open, onOpenChange, onInviteCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [inviteUrl, setInviteUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleClose() {
    onOpenChange(false)
    // Reset after animation
    setTimeout(() => {
      setStep(1)
      setSelectedRole(null)
      setInviteUrl("")
      setError(null)
      setCopied(false)
    }, 300)
  }

  async function handleGenerate() {
    if (!selectedRole) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/business/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Error al crear invitación")
      }
      const data = await res.json()
      const fullUrl = `${window.location.origin}${data.inviteUrl}`
      setInviteUrl(fullUrl)
      setStep(2)
      onInviteCreated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear invitación")
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await copyToClipboard(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-6">
            <DialogTitle className="text-lg font-semibold">
              {step === 1 ? "Invitar operador" : "Link de invitación"}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8 text-muted-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">Seleccioná el rol del operador que vas a invitar.</p>
              <div className="flex flex-col gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setSelectedRole(r.value)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-xl border p-4 text-left transition-colors",
                      selectedRole === r.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                  >
                    <span className="font-medium text-sm">{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.description}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                onClick={handleGenerate}
                disabled={!selectedRole || loading}
                className="w-full mt-2"
              >
                {loading ? "Generando..." : "Generar link"}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Compartí este link con el operador. El link es de un solo uso y expira en 7 días.
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                <span className="flex-1 truncate text-xs font-mono text-foreground">{inviteUrl}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <CopySimple className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <Button onClick={handleClose} variant="outline" className="w-full">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
