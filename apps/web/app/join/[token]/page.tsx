"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Buildings, CheckCircle, ProhibitInset, Warning } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTranslation } from "@/hooks/useTranslation"

type InviteStatus = "loading" | "valid" | "expired" | "revoked" | "already_accepted" | "error"

type InviteData = {
  status: InviteStatus
  id?: number
  businessId?: number
  businessName?: string
  role?: "cashier"
  invitedByName?: string
  expiresAt?: string
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { t, locale } = useTranslation()
  const [invite, setInvite] = useState<InviteData>({ status: "loading" })
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const acceptedRef = useRef(false)

  const loading = invite.status === "loading" || isLoggedIn === null
  const inviteValid = invite.status === "valid"

  useEffect(() => {
    async function loadInvite() {
      try {
        const [inviteRes, meRes] = await Promise.all([
          fetch(`/api/join/${token}`),
          fetch("/api/session"),
        ])

        setIsLoggedIn(meRes.ok)

        if (inviteRes.status === 404) {
          setInvite({ status: "error" })
          return
        }
        const { data } = await inviteRes.json()
        setInvite(data)
      } catch {
        setInvite({ status: "error" })
      }
    }

    if (token) loadInvite()
  }, [token])

  useEffect(() => {
    if (!loading && isLoggedIn && inviteValid && !acceptedRef.current) {
      acceptedRef.current = true
      handleAccept()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn, inviteValid])

  async function handleAccept() {
    setAccepting(true)
    setAcceptError(null)
    try {
      const res = await fetch(`/api/join/${token}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setAcceptError(data.error ?? t("join-failed-to-accept"))
        return
      }
      router.push("/dashboard/business/home")
    } catch {
      setAcceptError(t("join-failed-to-accept"))
    } finally {
      setAccepting(false)
    }
  }

  function handleGoToRegister() {
    router.push(`/onboarding/register?invite=${token}`)
  }

  if (invite.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-muted-foreground text-sm">{t("join-loading")}</span>
      </div>
    )
  }

  if (invite.status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <Warning className="h-12 w-12 text-amber-500" />
          <h1 className="text-xl font-semibold">{t("join-expired-title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("join-ask-new-invite")}
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
          <h1 className="text-xl font-semibold">{t("join-revoked-title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("join-ask-new-invite")}
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
          <h1 className="text-xl font-semibold">{t("join-already-used-title")}</h1>
          {isLoggedIn && (
            <Button asChild className="mt-2">
              <Link href="/dashboard/business/home">{t("join-go-to-dashboard")}</Link>
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
          <h1 className="text-xl font-semibold">{t("join-not-found-title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("join-not-found-desc")}
          </p>
        </div>
      </div>
    )
  }

  // Valid invite
  const expiresDate = invite.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
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
            <p className="text-sm text-muted-foreground">{t("join-invitation-from")}</p>
            <h1 className="text-xl font-semibold">{invite.businessName}</h1>
          </div>
        </div>

        {/* Invite details card */}
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("role-label")}</span>
            <span className="font-medium">{invite.role ? t("role-cashier") : "—"}</span>
            {invite.role && (
              <span className="text-xs text-muted-foreground">{t("role-cashier-desc")}</span>
            )}
          </div>
          {invite.invitedByName && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("join-invited-by")}</span>
              <span className="text-sm">{invite.invitedByName}</span>
            </div>
          )}
          {expiresDate && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("join-expires-on")}</span>
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
              {accepting ? t("join-accepting") : t("join-accept")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-center">
              {t("join-need-account")}
            </p>
            <Button className="w-full" onClick={handleGoToRegister}>
              {t("join-create-account")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
