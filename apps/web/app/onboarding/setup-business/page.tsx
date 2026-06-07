"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"
import { SESSION_QUERY_KEY } from "@/hooks/useUser"

export default function SetupBusinessPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !loading && name.trim().length >= 2

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/business/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? t("unexpected-error"))
        return
      }
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
      router.push("/onboarding/create-wallet")
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("setup-business-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("setup-business-subtitle")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="businessName">
          {t("setup-business-name-label")}
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="businessName"
          className="rounded-xl"
          placeholder={t("setup-business-name-placeholder")}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
          autoComplete="organization"
          maxLength={80}
          autoFocus
        />
        <p role="alert" className="text-xs text-destructive">{error ?? ''}</p>
      </div>

      <Button className="w-full rounded-xl" onClick={handleSubmit} disabled={!canSubmit}>
        {loading ? <><Spinner className="mr-2" />{t("continue")}</> : t("continue")}
      </Button>

    </OnboardingShell>
  )
}
