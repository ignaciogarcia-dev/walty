"use client"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"

function safeNext(next: string | null): string | null {
  if (!next) return null
  if (!next.startsWith("/")) return null
  if (next.startsWith("//")) return null
  if (next.includes("\n") || next.includes("\r")) return null
  return next
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get("next"))
  const invite = searchParams.get("invite")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(invite ? { inviteToken: invite } : {}) }),
      })
      if (res.ok) {
        const data = await res.json()
        let target: string
        if (data.hasActiveBusiness) {
          target = "/dashboard/business/home"
        } else if (data.requiresUsername) {
          target = "/onboarding/username"
        } else {
          target = next ?? "/dashboard"
        }
        window.location.assign(target)
      } else {
        const data = await res.json()
        const raw = data.message ?? data.error
        const errorKey = raw?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        type TKey = Parameters<typeof t>[0]
        const translated = errorKey ? t(errorKey as unknown as TKey) : null
        const translatedError = errorKey && translated && translated !== errorKey
          ? translated
          : (data.error ?? t("unexpected-error"))
        setError(translatedError)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleGoToLogin() {
    if (invite) {
      router.push(`/onboarding/login?next=/join/${invite}`)
    } else {
      router.push(`/onboarding/login${next ? `?next=${encodeURIComponent(next)}` : ""}`)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-register-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-register-description")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoComplete="email"
            className="rounded-xl"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            placeholder={t("minimum-8-characters")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoComplete="new-password"
            className="rounded-xl"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={loading || !email || password.length < 8} className="w-full rounded-xl">
        {loading ? <><Spinner className="mr-2" />{t("registering")}</> : t("register")}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full rounded-xl text-xs text-muted-foreground hover:text-foreground"
        onClick={handleGoToLogin}
      >
        {t("go-to-login")}
      </Button>
    </OnboardingShell>
  )
}
