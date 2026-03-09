"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"

export default function RecoveryPhrasePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mnemonic } = useOnboarding()

  useEffect(() => {
    if (!mnemonic) router.replace("/onboarding/welcome")
  }, [mnemonic, router])

  if (!mnemonic) return null

  const words = mnemonic.split(" ")

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-recovery-phrase-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-recovery-phrase-description")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 select-none">
        {words.map((word, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded-2xl border bg-muted/50 px-2.5 py-2"
          >
            <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
            <span className="text-sm font-mono font-medium text-foreground">{word}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
        Write these words down in order. Never share them with anyone.
      </div>

      <Button className="w-full rounded-xl" onClick={() => router.push("/onboarding/confirm-recovery")}>
        {t("onboarding-i-saved-phrase")}
      </Button>
    </OnboardingShell>
  )
}
