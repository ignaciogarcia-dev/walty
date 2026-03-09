"use client"
import { useEffect, useState } from "react"
import { mnemonicToAccount } from "viem/accounts"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"
import { decryptSeedWithPin, encryptSeed, type PinEncryptedSeed } from "@/lib/crypto"
import { saveWallet } from "@/lib/wallet-store"
import { fetchLinkedAddresses, isAddressLinked } from "@/lib/wallet-status"

type RecoveryMode = "pin" | "seed"

export default function RecoverPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const invalidLocal = searchParams.get("reason") === "invalid-local"
  const [mode, setMode] = useState<RecoveryMode>("pin")
  const [pin, setPin] = useState("")
  const [mnemonic, setMnemonic] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)
  const [checkingBackup, setCheckingBackup] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch("/api/wallet/backup")
      .then(async (res) => {
        if (!res.ok) throw new Error("backup-unavailable")
        const { backup } = await res.json()
        if (cancelled) return
        const backupAvailable = backup !== null
        setHasBackup(backupAvailable)
        setMode(backupAvailable ? "pin" : "seed")
      })
      .catch(() => {
        if (cancelled) return
        setHasBackup(false)
        setMode("seed")
      })
      .finally(() => {
        if (!cancelled) setCheckingBackup(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function persistRecoveredWallet(seedPhrase: string, address: string) {
    if (newPassword.length < 8) {
      throw new Error(t("password-too-short"))
    }

    const encrypted = await encryptSeed(seedPhrase, newPassword)
    saveWallet({ encrypted, address })
    router.push("/dashboard")
  }

  const handleRecoverWithPin = async () => {
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
      await persistRecoveredWallet(mnemonic, backupFull.walletAddress)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error-recovering-wallet"))
    } finally {
      setLoading(false)
    }
  }

  const handleImportSeed = async () => {
    setError(null)
    setLoading(true)
    try {
      const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, " ")
      const account = mnemonicToAccount(normalizedMnemonic)
      const linkedResult = await fetchLinkedAddresses()

      if (!linkedResult || !linkedResult.isAuthenticated) {
        throw new Error(t("error-recovering-wallet"))
      }

      if (!isAddressLinked(account.address, linkedResult.addresses)) {
        throw new Error(t("recovery-phrase-not-linked"))
      }

      await persistRecoveredWallet(normalizedMnemonic, account.address)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error-recovering-wallet"))
    } finally {
      setLoading(false)
    }
  }

  if (checkingBackup) {
    return (
      <OnboardingShell>
        <div className="flex flex-col items-center gap-4 py-4">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">{t("checking")}</p>
        </div>
      </OnboardingShell>
    )
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-recover-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {invalidLocal
            ? t("onboarding-recover-invalid-local-description")
            : t("onboarding-recover-description")}
        </p>
      </div>

      {invalidLocal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          <p className="font-medium">{t("local-wallet-mismatch-title")}</p>
          <p className="mt-1">{t("local-wallet-mismatch-description")}</p>
        </div>
      )}

      {hasBackup ? (
        <Tabs value={mode} onValueChange={(value) => { setMode(value as RecoveryMode); setError(null) }}>
          <TabsList className="w-full">
            <TabsTrigger value="pin" className="flex-1">{t("recovery-with-pin")}</TabsTrigger>
            <TabsTrigger value="seed" className="flex-1">{t("recovery-with-seed")}</TabsTrigger>
          </TabsList>

          <TabsContent value="pin" className="mt-4 flex flex-col gap-4">
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
                onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && newPassword.length >= 8 && handleRecoverWithPin()}
                autoFocus
                className="rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password-pin">{t("new-wallet-password")}</Label>
              <Input
                id="new-password-pin"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null) }}
                onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && newPassword.length >= 8 && handleRecoverWithPin()}
                autoComplete="new-password"
                className="rounded-xl"
              />
            </div>

            <Button
              className="w-full rounded-xl"
              onClick={handleRecoverWithPin}
              disabled={loading || pin.length < 4 || newPassword.length < 8}
            >
              {loading
                ? <><Spinner className="mr-2" />{t("recovering")}</>
                : t("recover-wallet")}
            </Button>
          </TabsContent>

          <TabsContent value="seed" className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mnemonic">{t("recovery-phrase")}</Label>
              <textarea
                id="mnemonic"
                placeholder={t("recovery-phrase-placeholder")}
                value={mnemonic}
                onChange={(e) => { setMnemonic(e.target.value); setError(null) }}
                className="min-h-28 rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password-seed">{t("new-wallet-password")}</Label>
              <Input
                id="new-password-seed"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null) }}
                onKeyDown={(e) => e.key === "Enter" && mnemonic.trim() && newPassword.length >= 8 && handleImportSeed()}
                autoComplete="new-password"
                className="rounded-xl"
              />
            </div>

            <Button
              className="w-full rounded-xl"
              onClick={handleImportSeed}
              disabled={loading || !mnemonic.trim() || newPassword.length < 8}
            >
              {loading
                ? <><Spinner className="mr-2" />{t("recovering")}</>
                : t("recovery-import-wallet")}
            </Button>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
            <p className="font-medium">{t("recovery-no-backup")}</p>
            <p className="mt-1">{t("recovery-no-backup-description")}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mnemonic-no-backup">{t("recovery-phrase")}</Label>
            <textarea
              id="mnemonic-no-backup"
              placeholder={t("recovery-phrase-placeholder")}
              value={mnemonic}
              onChange={(e) => { setMnemonic(e.target.value); setError(null) }}
              className="min-h-28 rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password-no-backup">{t("new-wallet-password")}</Label>
            <Input
              id="new-password-no-backup"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null) }}
              onKeyDown={(e) => e.key === "Enter" && mnemonic.trim() && newPassword.length >= 8 && handleImportSeed()}
              autoComplete="new-password"
              className="rounded-xl"
            />
          </div>

          <Button
            className="w-full rounded-xl"
            onClick={handleImportSeed}
            disabled={loading || !mnemonic.trim() || newPassword.length < 8}
          >
            {loading
              ? <><Spinner className="mr-2" />{t("recovering")}</>
              : t("recovery-import-wallet")}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </OnboardingShell>
  )
}
