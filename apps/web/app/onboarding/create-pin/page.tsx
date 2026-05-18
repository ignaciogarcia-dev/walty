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
import { encryptSeedV3 } from "@/lib/crypto"
import { saveWallet, type StoredWalletV3 } from "@/lib/wallet-store"
import { getWalletClient } from "@/lib/rpc/getWalletClient"

export default function CreatePinPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mnemonic, address, clear, markCompleted, completed } = useOnboarding()
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if ((!mnemonic || !address) && !completed) {
      router.replace("/onboarding/create-wallet?reason=reloaded")
    }
  }, [mnemonic, address, completed, router])

  if (!mnemonic || !address) return null

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
      // 1. Encrypt seed locally with v3 (DK+KEK) and save to IndexedDB
      const encrypted = await encryptSeedV3(mnemonic, pin)
      await saveWallet({ encrypted, address } satisfies StoredWalletV3)

      // 2. Link wallet via nonce + EIP-191 signature (required before server backup)
      const nonceRes = await fetch("/api/wallet/nonce", { method: "POST" })
      if (!nonceRes.ok) {
        if (nonceRes.status === 429) throw new Error(t("too-many-requests"))
        throw new Error("Nonce error")
      }
      const { data: { nonce } } = await nonceRes.json()

      const walletClient = getWalletClient(mnemonic, 1)
      const message = `Link wallet ${address} nonce ${nonce}`
      const signature = await walletClient.signMessage({ message })

      const linkRes = await fetch("/api/wallet/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, nonce }),
      })
      if (!linkRes.ok) throw new Error("Wallet link error")

      // 3. Create server backup: same V3 encrypted object
      const backupRes = await fetch("/api/wallet/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encrypted),
      })
      // Backup failures are non-fatal — wallet is already saved locally
      if (!backupRes.ok) {
        // Only log in development, silently fail in production
        if (process.env.NODE_ENV === "development") {
          console.warn("Backup upload failed, continuing (non-fatal)")
        }
      }

      // 4. Mark flow complete so sibling routes don't treat cleared mnemonic as reload
      markCompleted()

      // 5. Clear mnemonic from onboarding state (RAM only)
      clear()

      // Return to dashboard — user will be prompted to unlock explicitly
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

      {error && <p className="text-xs text-destructive">{error}</p>}

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
