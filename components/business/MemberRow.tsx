"use client"

import { useState } from "react"
import { Check, CopySimple, DotsThree, Wallet, Warning } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/useTranslation"
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
  role: "cashier"
  status: "invited" | "active" | "suspended" | "revoked"
  inviteEmail: string | null
  inviteToken: string
  userId: number | null
  email: string | null
  username: string | null
  walletAddress: string | null
  expiresAt: string
  createdAt: string
  lastActivityAt: string | null
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
  const { t, locale } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [copiedWallet, setCopiedWallet] = useState(false)
  const [loading, setLoading] = useState(false)
  const [revokeBlocked, setRevokeBlocked] = useState(false)

  const displayName = member.username ?? member.email ?? member.inviteEmail ?? "—"
  const lastActive = member.lastActivityAt
    ? new Date(member.lastActivityAt).toLocaleDateString(locale)
    : "—"
  const statusLabel =
    member.status === "invited"
      ? t("member-status-invited")
      : member.status === "active"
        ? t("member-status-active")
        : member.status === "suspended"
          ? t("member-status-suspended")
          : t("member-status-revoked")

  async function handleCopyInvite() {
    const url = `${window.location.origin}/join/${member.inviteToken}`
    await copyToClipboard(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleCopyWallet() {
    if (!member.walletAddress) return
    await copyToClipboard(member.walletAddress)
    setCopiedWallet(true)
    setTimeout(() => setCopiedWallet(false), 1500)
  }

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setLoading(true)
    setRevokeBlocked(false)
    try {
      const res = await fetch(`/api/business/members/${member.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action !== "delete" ? JSON.stringify({ action, ...extra }) : undefined,
      })
      if (!res.ok) {
        const data = await res.json()
        // operator-has-balance is a known policy error — show inline instead of alert
        if (data.message === "operator-has-balance") {
          setRevokeBlocked(true)
          return
        }
        alert(data.message ?? data.error ?? t("error"))
        return
      }
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr className="border-b border-border last:border-0">
      {/* Name + wallet address */}
      <td className="py-3 px-4">
        <span className="text-sm font-medium truncate max-w-[140px] block">{displayName}</span>
        {member.status === "invited" && !member.walletAddress && (
          <span className="text-xs text-muted-foreground">{t("team-pending-registration")}</span>
        )}
        {member.walletAddress && (
          <button
            type="button"
            onClick={handleCopyWallet}
            className="flex cursor-pointer items-center gap-1 mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            title={member.walletAddress}
          >
            <Wallet className="h-3 w-3 shrink-0" />
            <span className="font-mono">
              {member.walletAddress.slice(0, 6)}…{member.walletAddress.slice(-4)}
            </span>
            {copiedWallet ? (
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <CopySimple className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
        )}
        {/* Inline warning when revoke is blocked by balance */}
        {revokeBlocked && (
          <div className="flex items-start gap-1.5 mt-1.5 rounded-lg border border-amber-300/50 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800/50 px-2 py-1.5">
            <Warning className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-px" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-tight">
              {t("team-revoke-blocked", { section: t("cashier-wallets") })}
            </p>
          </div>
        )}
      </td>

      {/* Role */}
      <td className="py-3 pr-4">
        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-600">
          {t("role-cashier")}
        </span>
      </td>

      {/* Status */}
      <td className="py-3 pr-4">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLOR[member.status])}>
          {statusLabel}
        </span>
      </td>

      {/* Last activity */}
      <td className="py-3 pr-4 text-sm text-muted-foreground">{lastActive}</td>

      {/* Actions */}
      <td className="py-3">
        <DropdownMenu onOpenChange={(open) => { if (!open) setRevokeBlocked(false) }}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" disabled={loading}>
              <DotsThree className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {member.status === "invited" && (
              <>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                  onSelect={handleCopyInvite}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <CopySimple className="h-3.5 w-3.5" />
                  )}
                  {t("copy-link")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  onSelect={() => doAction("delete")}
                >
                  {t("delete-invitation")}
                </DropdownMenuItem>
              </>
            )}
            {member.status === "active" && (
              <>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  onSelect={() => doAction("suspend")}
                >
                  {t("suspend")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 h-px bg-border" />
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  onSelect={() => doAction("revoke")}
                >
                  {t("revoke-access")}
                </DropdownMenuItem>
              </>
            )}
            {member.status === "suspended" && (
              <>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                  onSelect={() => doAction("reactivate")}
                >
                  {t("reactivate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 h-px bg-border" />
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  onSelect={() => doAction("revoke")}
                >
                  {t("revoke-access")}
                </DropdownMenuItem>
              </>
            )}
            {member.status === "revoked" && (
              <DropdownMenuItem
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground cursor-default"
                disabled
              >
                {t("no-actions-available")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}
