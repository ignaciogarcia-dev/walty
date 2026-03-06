"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"
import { createWallet } from "@/lib/wallet"

export default function CreateWalletPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { setWallet } = useOnboarding()

  useEffect(() => {
    // Verify auth before generating wallet
    fetch("/api/me").then((res) => {
      if (!res.ok) {
        router.replace("/onboarding/welcome")
        return
      }
      const { mnemonic, address } = createWallet()
      setWallet(mnemonic, address)
      router.replace("/onboarding/recovery-phrase")
    }).catch(() => {
      router.replace("/onboarding/welcome")
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OnboardingShell>
      <div className="flex flex-col items-center gap-4 py-4">
        <Spinner className="size-8" />
        <p className="text-sm text-muted-foreground">{t("onboarding-creating-wallet")}</p>
      </div>
    </OnboardingShell>
  )
}
