"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"
import { createWallet } from "@/lib/wallet"

export default function CreateWalletPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mnemonic, setWallet, clear } = useOnboarding()
  const hasGenerated = useRef(false)
  /** True once wallet is committed to context for the recovery-phrase step — skip clear on unmount. */
  const handedOffRef = useRef(false)

  useEffect(() => {
    return () => {
      if (!handedOffRef.current) clear()
    }
  }, [clear])

  useEffect(() => {
    if (hasGenerated.current) return
    if (mnemonic) return // already generated — idempotent

    hasGenerated.current = true

    async function run() {
      const res = await fetch("/api/session")
      if (!res.ok) {
        hasGenerated.current = false
        router.replace("/onboarding/welcome")
        return
      }
      const wallet = createWallet()
      handedOffRef.current = true
      setWallet({ mnemonic: wallet.mnemonic, address: wallet.address })
      router.replace("/onboarding/recovery-phrase")
    }

    run().catch(() => {
      hasGenerated.current = false
      router.replace("/onboarding/welcome")
    })
  }, [mnemonic, setWallet, router])

  return (
    <OnboardingShell>
      <div className="flex flex-col items-center gap-4 py-4">
        <Spinner className="size-8" />
        <p className="text-sm text-muted-foreground">{t("onboarding-creating-wallet")}</p>
      </div>
    </OnboardingShell>
  )
}
