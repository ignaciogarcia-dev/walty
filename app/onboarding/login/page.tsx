"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"
import { determineWalletStatus } from "@/lib/wallet-status"

export default function LoginPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t("invalid-credentials"))
        return
      }

      const status = await determineWalletStatus()

      if (status === "locked") {
        router.push("/dashboard")
        return
      }

      if (status === "recoverable") {
        router.push("/onboarding/recover")
        return
      }

      if (status === "invalid-local") {
        router.push("/onboarding/recover?reason=invalid-local")
        return
      }

      router.push("/onboarding/create-wallet")
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-login-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-login-description")}</p>
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
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoComplete="current-password"
            className="rounded-xl"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={loading || !email || !password} className="w-full rounded-xl">
        {loading ? <><Spinner className="mr-2" />{t("logging-in")}</> : t("login")}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full rounded-xl text-xs text-muted-foreground hover:text-foreground"
        onClick={() => router.push("/onboarding/register")}
      >
        {t("go-to-register")}
      </Button>
    </OnboardingShell>
  )
}
