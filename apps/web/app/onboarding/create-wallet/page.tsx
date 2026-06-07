"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"
import { getMpcClient } from "@/lib/mpc/getMpcClient"

export default function CreateWalletPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mpc, setMpc } = useOnboarding()
  const hasGenerated = useRef(false)

  useEffect(() => {
    if (hasGenerated.current) return
    if (mpc) return // already ran — idempotent
    hasGenerated.current = true

    async function run() {
      const res = await fetch("/api/session")
      if (!res.ok) {
        hasGenerated.current = false
        router.replace("/onboarding/welcome")
        return
      }

      // Run the 2-of-3 DKG: device(0)+backup(2) in the worker, server(1) over /mpc.
      // The server persists its share + registers the MPC address (no seed exists).
      const client = getMpcClient()
      try {
        await client.connect()
        const { keyId, result } = await client.runDkg()
        setMpc({
          keyId,
          deviceShareBytes: result.deviceShareBytes,
          backupShareBytes: result.backupShareBytes,
          pubkey: result.pubkey,
          address: result.address,
          generation: 1, // fresh DKG → mpc_keys.version starts at 1
        })
        router.replace("/onboarding/recovery-kit")
      } finally {
        await client.close()
      }
    }

    run().catch(() => {
      hasGenerated.current = false
      router.replace("/onboarding/welcome")
    })
  }, [mpc, setMpc, router])

  return (
    <OnboardingShell>
      <div className="flex flex-col items-center gap-4 py-4">
        <Spinner className="size-8" />
        <p className="text-sm text-muted-foreground">{t("onboarding-creating-wallet")}</p>
      </div>
    </OnboardingShell>
  )
}
