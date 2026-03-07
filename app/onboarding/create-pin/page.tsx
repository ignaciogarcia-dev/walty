"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"
import { encryptSeed, encryptSeedWithPin } from "@/lib/crypto"
import { saveWallet } from "@/lib/wallet-store"
import { getWalletClient } from "@/lib/signer"

export default function CreatePinPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mnemonic, address, clearWallet } = useOnboarding()
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    if (doneRef.current) return
    if (!mnemonic || !address) router.replace("/onboarding/welcome")
  }, [mnemonic, address, router])

  if (!mnemonic || !address) return null

  const handleSubmit = async () => {
    setError(null)

    if (pin.length < 4) {
      setError(t("pin-too-short"))
      return
    }
    if (pin !== confirmPin) {
      setError(t("pin-mismatch"))
      return
    }

    setLoading(true)
    try {
      // 1. Encrypt seed locally with PIN and save to localStorage
      const encrypted = await encryptSeed(mnemonic, pin)
      saveWallet({ encrypted, address })

      // 2. Create server backup: challenge → encrypt with PIN+challenge → POST
      const challengeRes = await fetch("/api/wallet/challenge")
      if (!challengeRes.ok) throw new Error("Challenge error")
      const { challenge } = await challengeRes.json()

      const pinEncrypted = await encryptSeedWithPin(mnemonic, pin, challenge)
      const backupRes = await fetch("/api/wallet/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: pinEncrypted.ciphertext,
          iv: pinEncrypted.iv,
          salt: pinEncrypted.salt,
          version: pinEncrypted.version,
          walletAddress: address,
        }),
      })
      // Backup failures are non-fatal — wallet is already saved locally
      if (!backupRes.ok) {
        // Only log in development, silently fail in production
        if (process.env.NODE_ENV === "development") {
          console.warn("Backup upload failed, continuing (non-fatal)")
        }
      }

      // 3. Link wallet via nonce + EIP-191 signature
      const nonceRes = await fetch("/api/wallet/nonce", { method: "POST" })
      if (!nonceRes.ok) throw new Error("Nonce error")
      const { nonce } = await nonceRes.json()

      const walletClient = getWalletClient(mnemonic)
      const message = `Link wallet ${address} nonce ${nonce}`
      const signature = await walletClient.signMessage({ message })

      const linkRes = await fetch("/api/wallet/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, nonce }),
      })
      if (!linkRes.ok) throw new Error("Wallet link error")

      // 4. Mark as done so the guard doesn't redirect on clearWallet
      doneRef.current = true

      // 5. Clear mnemonic from memory
      clearWallet()

      // 6. Signal the dashboard to auto-unlock on first load
      sessionStorage.setItem("pending_unlock", pin)

      router.push("/onboarding/username")
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
            placeholder="····"
            maxLength={6}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null) }}
          />
          <p className="text-xs text-muted-foreground">{t("pin-description")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-pin">{t("onboarding-confirm-pin-label")}</Label>
          <Input
            id="confirm-pin"
            type="password"
            inputMode="numeric"
            placeholder="····"
            maxLength={6}
            value={confirmPin}
            onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "")); setError(null) }}
            onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && confirmPin.length >= 4 && handleSubmit()}
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={loading || pin.length < 4 || confirmPin.length < 4}
      >
        {loading
          ? <><Spinner className="mr-2" />{t("setting-up-wallet")}</>
          : t("onboarding-continue")}
      </Button>
    </OnboardingShell>
  )
}
