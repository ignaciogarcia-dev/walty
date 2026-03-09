"use client"
import { useRouter } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"

export default function WelcomePage() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <OnboardingShell>
      <div className="text-center">
        <p className="text-muted-foreground text-sm mt-1">Your Ethereum wallet</p>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <Button className="w-full rounded-xl" onClick={() => router.push("/onboarding/register")}>
          {t("onboarding-create-new")}
        </Button>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">{t("or")}</span>
          <Separator className="flex-1" />
        </div>

        <Button variant="outline" className="w-full rounded-xl" onClick={() => router.push("/onboarding/login")}>
          {t("onboarding-already-have")}
        </Button>
      </div>
    </OnboardingShell>
  )
}
