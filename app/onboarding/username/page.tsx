"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"
import { SESSION_QUERY_KEY } from "@/hooks/useUser"

type CheckState = "idle" | "checking" | "available" | "taken"

export default function ProfilePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [checkState, setCheckState] = useState<CheckState>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced availability check for username
  useEffect(() => {
    const clean = username.trim().toLowerCase()
    if (clean.length < 3) { setCheckState("idle"); return }

    setCheckState("checking")
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?username=${encodeURIComponent(clean)}`)
        if (!res.ok) {
          setCheckState("idle")
          return
        }
        const { data: { available } } = await res.json()
        setCheckState(available ? "available" : "taken")
      } catch {
        setCheckState("idle")
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [username])

  const canSubmit = () => {
    if (!displayName.trim()) return false
    if (loading) return false
    const cleanUsername = username.trim()
    if (!cleanUsername) return false // Username is now required
    if (checkState !== "available") return false
    return true
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return

    setLoading(true)
    setError(null)
    try {
      const cleanUsername = username.trim().toLowerCase()
      const body: Record<string, string> = {
        displayName: displayName.trim(),
        username: cleanUsername, // Username is now required
      }

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t("unexpected-error"))
        return
      }
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
      router.push("/dashboard")
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-profile-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-profile-description")}</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Display Name (required) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">
            {t("onboarding-profile-name-label")}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="displayName"
            className="rounded-xl"
            placeholder={t("onboarding-profile-name-placeholder")}
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setError(null) }}
            onKeyDown={(e) => e.key === "Enter" && canSubmit() && handleSubmit()}
            autoComplete="name"
            maxLength={50}
            autoFocus
          />
        </div>

        {/* Username (required) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">
            Username
            <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
            <Input
              id="username"
              className="rounded-xl pl-7"
              placeholder={t("onboarding-username-placeholder")}
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null) }}
              onKeyDown={(e) => e.key === "Enter" && canSubmit() && handleSubmit()}
              autoComplete="username"
              maxLength={20}
              pattern="^[a-zA-Z0-9_]{0,20}$"
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
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <Button
        className="w-full rounded-xl"
        onClick={handleSubmit}
        disabled={!canSubmit()}
      >
        {loading ? <><Spinner className="mr-2" />{t("onboarding-continue")}</> : t("onboarding-continue")}
      </Button>
    </OnboardingShell>
  )
}
