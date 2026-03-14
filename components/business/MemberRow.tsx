"use client"

import { useState } from "react"
import { Check, CopySimple, DotsThree } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { copyToClipboard } from "@/utils/copyToClipboard"
import { cn } from "@/utils/style"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type Member = {
  id: number
  role: "manager" | "cashier" | "waiter"
  status: "invited" | "active" | "suspended" | "revoked"
  inviteEmail: string | null
  inviteToken: string
  userId: number | null
  email: string | null
  username: string | null
  expiresAt: string
  createdAt: string
  lastActivityAt: string | null
}

const ROLE_LABEL: Record<Member["role"], string> = {
  manager: "Gerente",
  cashier: "Cajero",
  waiter: "Mozo",
}

const ROLE_COLOR: Record<Member["role"], string> = {
  manager: "bg-blue-500/10 text-blue-600",
  cashier: "bg-amber-500/10 text-amber-600",
  waiter: "bg-green-500/10 text-green-600",
}

const STATUS_LABEL: Record<Member["status"], string> = {
  invited: "Invitado",
  active: "Activo",
  suspended: "Suspendido",
  revoked: "Revocado",
}

const STATUS_COLOR: Record<Member["status"], string> = {
  invited: "border border-border text-muted-foreground",
  active: "bg-primary/10 text-primary",
  suspended: "bg-destructive/10 text-destructive",
  revoked: "bg-muted text-muted-foreground",
}

type Props = {
  member: Member
  onUpdate: () => void
}

export function MemberRow({ member, onUpdate }: Props) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const displayName = member.username ?? member.email ?? member.inviteEmail ?? "—"
  const lastActive = member.lastActivityAt
    ? new Date(member.lastActivityAt).toLocaleDateString("es-AR")
    : "—"

  async function handleCopyInvite() {
    const url = `${window.location.origin}/join/${member.inviteToken}`
    await copyToClipboard(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setLoading(true)
    try {
      const res = await fetch(`/api/business/members/${member.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action !== "delete" ? JSON.stringify({ action, ...extra }) : undefined,
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Error")
        return
      }
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        <span className="text-sm font-medium truncate max-w-[140px] block">{displayName}</span>
        {member.status === "invited" && (
          <span className="text-xs text-muted-foreground">Pendiente de registro</span>
        )}
      </td>
      <td className="py-3 pr-4">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ROLE_COLOR[member.role])}>
          {ROLE_LABEL[member.role]}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLOR[member.status])}>
          {STATUS_LABEL[member.status]}
        </span>
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">{lastActive}</td>
      <td className="py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={loading}>
              <DotsThree className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[160px]"
            >
              {member.status === "invited" && (
                <>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                    onSelect={handleCopyInvite}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <CopySimple className="h-3.5 w-3.5" />}
                    Copiar link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    onSelect={() => doAction("delete")}
                  >
                    Eliminar invitación
                  </DropdownMenuItem>
                </>
              )}
              {member.status === "active" && (
                <>
                  {member.role !== "manager" && (
                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                      onSelect={() => doAction("change_role", { role: "manager" })}
                    >
                      Cambiar a Gerente
                    </DropdownMenuItem>
                  )}
                  {member.role !== "cashier" && (
                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                      onSelect={() => doAction("change_role", { role: "cashier" })}
                    >
                      Cambiar a Cajero
                    </DropdownMenuItem>
                  )}
                  {member.role !== "waiter" && (
                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                      onSelect={() => doAction("change_role", { role: "waiter" })}
                    >
                      Cambiar a Mozo
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="my-1 h-px bg-border" />
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    onSelect={() => doAction("suspend")}
                  >
                    Suspender
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    onSelect={() => doAction("revoke")}
                  >
                    Revocar acceso
                  </DropdownMenuItem>
                </>
              )}
              {member.status === "suspended" && (
                <>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                    onSelect={() => doAction("reactivate")}
                  >
                    Reactivar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    onSelect={() => doAction("revoke")}
                  >
                    Revocar acceso
                  </DropdownMenuItem>
                </>
              )}
              {member.status === "revoked" && (
                <DropdownMenuItem className="rounded-lg px-3 py-2 text-sm text-muted-foreground cursor-default" disabled>
                  Sin acciones disponibles
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}
