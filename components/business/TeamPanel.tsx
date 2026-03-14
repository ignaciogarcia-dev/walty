"use client"

import { useEffect, useState } from "react"
import { UserPlus } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { InviteModal } from "@/components/business/InviteModal"
import { MemberRow, type Member } from "@/components/business/MemberRow"

export function TeamPanel() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)

  async function loadMembers() {
    try {
      const res = await fetch("/api/business/members")
      if (!res.ok) return
      const data = await res.json()
      setMembers(data.members)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Equipo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administrá los operadores de tu negocio
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invitar operador
        </Button>
      </div>

      <InviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInviteCreated={loadMembers}
      />

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="text-sm text-muted-foreground text-center py-8">Cargando equipo...</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No hay miembros en el equipo todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full px-4">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 pt-4 px-4 text-left text-xs font-medium text-muted-foreground">Usuario</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground">Rol</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground">Última actividad</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="px-4">
                {members.map((m) => (
                  <MemberRow key={m.id} member={m} onUpdate={loadMembers} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
