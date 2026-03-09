"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"

type CheckState = "idle" | "checking" | "available" | "taken"

export default function UsernamePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [checkState, setCheckState] = useState<CheckState>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced availability check
  useEffect(() => {
    const clean = username.trim().toLowerCase()
    if (clean.length < 3) { setCheckState("idle"); return }

    setCheckState("checking")
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?username=${encodeURIComponent(clean)}`)
        const { available } = await res.json()
        setCheckState(available ? "available" : "taken")
      } catch {
        setCheckState("idle")
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [username])

  const handleSubmit = async () => {
    const clean = username.trim().toLowerCase()
    if (!clean) { router.push("/onboarding/complete"); return }
    if (checkState !== "available") return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: clean }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t("unexpected-error"))
        return
      }
      router.push("/onboarding/complete")
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-username-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-username-description")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">{t("onboarding-username-placeholder")}</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
          <Input
            id="username"
            className="rounded-xl pl-7"
            placeholder={t("onboarding-username-placeholder")}
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(null) }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoComplete="username"
          />
        </div>
        {checkState === "checking" && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Spinner className="size-3" />{t("checking")}
          </p>
        )}
        {checkState === "available" && (
          <p className="text-xs text-green-600 dark:text-green-400">{t("onboarding-username-available")}</p>
        )}
        {checkState === "taken" && (
          <p className="text-xs text-destructive">{t("onboarding-username-taken")}</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          className="w-full rounded-xl"
          onClick={handleSubmit}
          disabled={loading || checkState === "taken" || checkState === "checking" || (!!username.trim() && checkState !== "available")}
        >
          {loading ? <><Spinner className="mr-2" />{t("checking")}</> : t("onboarding-continue")}
        </Button>
        <Button variant="ghost" className="w-full rounded-xl" onClick={() => router.push("/onboarding/complete")}>
          {t("onboarding-skip")}
        </Button>
      </div>
    </OnboardingShell>
  )
}
