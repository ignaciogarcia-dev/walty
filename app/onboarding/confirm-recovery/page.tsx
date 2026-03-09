"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"

export default function ConfirmRecoveryPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mnemonic } = useOnboarding()

  useEffect(() => {
    if (!mnemonic) router.replace("/onboarding/welcome")
  }, [mnemonic, router])

  if (!mnemonic) return null

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-confirm-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-confirm-description")}</p>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <Button className="w-full rounded-xl" onClick={() => router.push("/onboarding/create-pin")}>
          {t("onboarding-yes-saved")}
        </Button>
        <Button variant="outline" className="w-full rounded-xl" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
      </div>
    </OnboardingShell>
  )
}
