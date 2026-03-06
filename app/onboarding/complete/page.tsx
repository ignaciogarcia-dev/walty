"use client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"

export default function CompletePage() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <OnboardingShell>
      <div className="flex flex-col items-center text-center gap-2 py-4">
        <div className="text-5xl">✓</div>
        <h2 className="text-xl font-semibold text-foreground">{t("onboarding-complete-title")}</h2>
        <p className="text-sm text-muted-foreground">{t("onboarding-complete-description")}</p>
      </div>

      <Button className="w-full" onClick={() => router.push("/dashboard")}>
        {t("onboarding-enter-app")}
      </Button>
    </OnboardingShell>
  )
}
