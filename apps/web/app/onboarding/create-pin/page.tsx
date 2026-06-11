"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"
import { saveDeviceShare } from "@/lib/mpc/deviceShareStore"

export default function CreatePinPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { address, mpc, clear, markCompleted, completed } = useOnboarding()
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address && !completed) {
      router.replace("/onboarding/create-wallet?reason=reloaded")
    }
  }, [address, completed, router])

  if (!address) return null

  const handleSubmit = async () => {
    setError(null)

    if (pin.length < 6) {
      setError(t("pin-too-short"))
      return
    }
    if (pin !== confirmPin) {
      setError(t("pin-mismatch"))
      return
    }

    setLoading(true)
    try {
      if (!mpc) {
        throw new Error(t("unexpected-error"))
      }

      // Recovery flow: commit the staged server share FIRST, while no local
      // device share exists yet. The re-issued kit (gen N+1) was already
      // downloaded in the recovery-kit step, so once the commit lands
      // {kit, server} are a valid pair at N+1. Only then persist the device
      // share. If the commit fails we never save a local share, so walletStatus
      // stays "recoverable" and the user can retry kit recovery.
      if (mpc.recoverToken) {
        const commitRes = await fetch("/api/mpc-recover/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commitToken: mpc.recoverToken }),
        })
        if (!commitRes.ok) {
          const body = await commitRes.json().catch(() => ({}))
          throw new Error(
            body?.message === "recovery_session_expired"
              ? t("recovery-session-expired")
              : t("error-recovering-wallet"),
          )
        }
      }

      await saveDeviceShare(mpc.deviceShareBytes, pin, {
        keyId: mpc.keyId,
        pubkey: mpc.pubkey,
        address: mpc.address,
      })
      markCompleted()
      clear()
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unexpected-error"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-create-pin-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-create-pin-description")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pin">{t("recovery-pin")}</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            placeholder="······"
            maxLength={8}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null) }}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">{t("pin-description")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-pin">{t("onboarding-confirm-pin-label")}</Label>
          <Input
            id="confirm-pin"
            type="password"
            inputMode="numeric"
            placeholder="······"
            maxLength={8}
            value={confirmPin}
            onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "")); setError(null) }}
            onKeyDown={(e) => e.key === "Enter" && pin.length >= 6 && confirmPin.length >= 6 && handleSubmit()}
            className="rounded-xl"
          />
        </div>
      </div>

      <p role="alert" className="text-xs text-destructive">{error ?? ''}</p>

      <Button
        className="w-full rounded-xl"
        onClick={handleSubmit}
        disabled={loading || pin.length < 6 || confirmPin.length < 6}
      >
        {loading
          ? <><Spinner className="mr-2" />{t("setting-up-wallet")}</>
          : t("onboarding-continue")}
      </Button>
    </OnboardingShell>
  )
}
