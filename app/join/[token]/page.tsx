"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Buildings, CheckCircle, ProhibitInset, Warning } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

type InviteStatus = "loading" | "valid" | "expired" | "revoked" | "already_accepted" | "error"

type InviteData = {
  status: InviteStatus
  id?: number
  businessId?: number
  businessName?: string
  role?: "manager" | "cashier" | "waiter"
  invitedByName?: string
  expiresAt?: string
}

const ROLE_LABEL: Record<string, string> = {
  manager: "Gerente",
  cashier: "Cajero",
  waiter: "Mozo",
}

const ROLE_DESCRIPTION: Record<string, string> = {
  manager: "Puede generar cobros, ver reportes y solicitar reembolsos",
  cashier: "Puede generar cobros y confirmar pagos",
  waiter: "Puede generar cobros QR y ver el estado del pago",
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [invite, setInvite] = useState<InviteData>({ status: "loading" })
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    async function loadInvite() {
      try {
        const [inviteRes, meRes] = await Promise.all([
          fetch(`/api/join/${token}`),
          fetch("/api/me"),
        ])

        setIsLoggedIn(meRes.ok)

        if (inviteRes.status === 404) {
          setInvite({ status: "error" })
          return
        }
        const data = await inviteRes.json()
        setInvite(data)
      } catch {
        setInvite({ status: "error" })
      }
    }

    if (token) loadInvite()
  }, [token])

  async function handleAccept() {
    setAccepting(true)
    setAcceptError(null)
    try {
      const res = await fetch(`/api/join/${token}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setAcceptError(data.error ?? "Error al aceptar la invitación")
        return
      }
      router.push("/dashboard/business/home")
    } catch {
      setAcceptError("Error al aceptar la invitación")
    } finally {
      setAccepting(false)
    }
  }

  const nextParam = `?next=/join/${token}`

  if (invite.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-muted-foreground text-sm">Cargando invitación...</span>
      </div>
    )
  }

  if (invite.status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <Warning className="h-12 w-12 text-amber-500" />
          <h1 className="text-xl font-semibold">Esta invitación expiró</h1>
          <p className="text-sm text-muted-foreground">
            Pedile al administrador del negocio que te envíe una nueva invitación.
          </p>
        </div>
      </div>
    )
  }

  if (invite.status === "revoked") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <ProhibitInset className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-semibold">Esta invitación fue cancelada</h1>
          <p className="text-sm text-muted-foreground">
            Pedile al administrador del negocio que te envíe una nueva invitación.
          </p>
        </div>
      </div>
    )
  }

  if (invite.status === "already_accepted") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <CheckCircle className="h-12 w-12 text-primary" />
          <h1 className="text-xl font-semibold">Esta invitación ya fue utilizada</h1>
          {isLoggedIn && (
            <Button asChild className="mt-2">
              <Link href="/dashboard/business/home">Ir al dashboard →</Link>
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (invite.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <Warning className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-semibold">Invitación no encontrada</h1>
          <p className="text-sm text-muted-foreground">
            Este link no es válido o ya no existe.
          </p>
        </div>
      </div>
    )
  }

  // Valid invite
  const expiresDate = invite.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full flex flex-col gap-6">
        {/* Header */}
        <div className="text-center flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Buildings className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Invitación de</p>
            <h1 className="text-xl font-semibold">{invite.businessName}</h1>
          </div>
        </div>

        {/* Invite details card */}
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Rol</span>
            <span className="font-medium">{invite.role ? ROLE_LABEL[invite.role] : "—"}</span>
            {invite.role && (
              <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[invite.role]}</span>
            )}
          </div>
          {invite.invitedByName && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Invitado por</span>
              <span className="text-sm">{invite.invitedByName}</span>
            </div>
          )}
          {expiresDate && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Expira el</span>
              <span className="text-sm">{expiresDate}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {isLoggedIn ? (
          <div className="flex flex-col gap-3">
            {acceptError && (
              <p className="text-sm text-destructive text-center">{acceptError}</p>
            )}
            <Button onClick={handleAccept} disabled={accepting} className="w-full">
              {accepting ? "Aceptando..." : "Aceptar invitación"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-center">
              Necesitás una cuenta para aceptar esta invitación.
            </p>
            <Button asChild className="w-full">
              <Link href={`/onboarding/login${nextParam}`}>Iniciar sesión</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/onboarding${nextParam}`}>Crear cuenta</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
