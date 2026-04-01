"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { UserCirclePlus } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { InviteModal } from "@/components/business/InviteModal"
import { MemberRow, type Member } from "@/components/business/MemberRow"
import { useTranslation } from "@/hooks/useTranslation"

export const TEAM_MEMBERS_QUERY_KEY = ["team-members"] as const

export function TeamPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)

  const { data: members = [], isLoading } = useQuery({
    queryKey: TEAM_MEMBERS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/business/members")
      if (!res.ok) throw new Error("Failed to load members")
      const { data } = await res.json()
      return data.members as Member[]
    },
    staleTime: 30_000,
  })

  function handleInviteCreated() {
    queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_QUERY_KEY })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("team")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("team-manage-desc")}
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} size="sm" className="gap-2 rounded-xl">
          <UserCirclePlus className="h-4 w-4" />
          {t("invite-operator")}
        </Button>
      </div>

      <InviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInviteCreated={handleInviteCreated}
      />

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="text-sm text-muted-foreground text-center py-8">{t("team-loading")}</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {t("team-no-members")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full px-4">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 pt-4 px-4 text-left text-xs font-medium text-muted-foreground">{t("team-col-user")}</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground">{t("role-label")}</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground">{t("status")}</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground">{t("team-col-last-activity")}</th>
                  <th className="pb-3 pt-4 pr-4 text-left text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="px-4">
                {members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onUpdate={handleInviteCreated} // same query invalidation
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
