"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"
import { decryptSeedWithPin, encryptSeed, type PinEncryptedSeed } from "@/lib/crypto"
import { saveWallet } from "@/lib/wallet-store"

export default function RecoverPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRecover = async () => {
    setError(null)
    setLoading(true)
    try {
      const [backupRes, challengeRes] = await Promise.all([
        fetch("/api/wallet/backup"),
        fetch("/api/wallet/challenge"),
      ])

      if (!backupRes.ok || !challengeRes.ok) throw new Error(t("error-recovering-wallet"))

      const { backup } = await backupRes.json()
      const { challenge } = await challengeRes.json()

      if (!backup) throw new Error(t("error-recovering-wallet"))

      const backupFull = backup as PinEncryptedSeed & { walletAddress: string }
      const mnemonic = await decryptSeedWithPin(backupFull, pin, challenge)

      // Re-encrypt locally with PIN as the local wallet password
      const encrypted = await encryptSeed(mnemonic, pin)
      saveWallet({ encrypted, address: backupFull.walletAddress })

      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error-recovering-wallet"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-recover-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-recover-description")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pin">{t("recovery-pin")}</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          placeholder="····"
          maxLength={6}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null) }}
          onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && handleRecover()}
          autoFocus
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        className="w-full"
        onClick={handleRecover}
        disabled={loading || pin.length < 4}
      >
        {loading
          ? <><Spinner className="mr-2" />{t("recovering")}</>
          : t("onboarding-recover-title")}
      </Button>
    </OnboardingShell>
  )
}
