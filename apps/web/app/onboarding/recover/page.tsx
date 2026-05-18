"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { mnemonicToAccount } from "viem/accounts"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"
import { decryptSeedV3, encryptSeedV3, type EncryptedSeedV3 } from "@/lib/crypto"
import { saveWallet, type StoredWalletV3 } from "@/lib/wallet-store"
import { fetchLinkedAddresses, isAddressLinked } from "@/lib/wallet-status"

type RecoveryMode = "pin" | "seed"

export default function RecoverPage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const invalidLocal = searchParams.get("reason") === "invalid-local"
  const [mode, setMode] = useState<RecoveryMode>("pin")
  const [pin, setPin] = useState("")
  const [mnemonic, setMnemonic] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { data: backupData, isLoading: checkingBackup } = useQuery({
    queryKey: ["wallet-backup-check"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/backup")
      if (!res.ok) return null
      const { data } = await res.json()
      return data ?? null
    },
    staleTime: Infinity,
    retry: false,
  })
  const hasBackup = backupData !== null && backupData !== undefined

  async function persistRecoveredWallet(seedPhrase: string, address: string) {
    if (pin.length < 6) {
      throw new Error(t("pin-too-short"))
    }

    // Encrypt with v3 (DK+KEK) and save to IndexedDB
    const encrypted = await encryptSeedV3(seedPhrase, pin)
    await saveWallet({ encrypted, address } satisfies StoredWalletV3)
    // Force a hard navigation so the app remounts with the new local wallet state.
    // User will be prompted to unlock explicitly on the dashboard.
    window.location.assign("/dashboard")
  }

  const handleRecoverWithPin = async () => {
    setError(null)
    setLoading(true)
    try {
      const backupRes = await fetch("/api/wallet/backup")
      if (!backupRes.ok) throw new Error(t("error-recovering-wallet"))

      const { data: backup } = await backupRes.json()
      if (!backup) throw new Error(t("error-recovering-wallet"))

      const backupData = backup as EncryptedSeedV3
      const recoveredMnemonic = await decryptSeedV3(backupData, pin)

      // Derive address from mnemonic
      const addr = mnemonicToAccount(recoveredMnemonic).address
      await persistRecoveredWallet(recoveredMnemonic, addr)
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
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (loading) return
                if (pin.length < 6) return
                handleRecoverWithPin()
              }}
            >
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
                  autoFocus
                  className="rounded-xl"
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl"
                disabled={loading || pin.length < 6}
              >
                {loading
                  ? <><Spinner className="mr-2" />{t("recovering")}</>
                  : t("recover-wallet")}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="seed" className="mt-4 flex flex-col gap-4">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (loading) return
                if (!mnemonic.trim() || pin.length < 6) return
                handleImportSeed()
              }}
            >
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
                <Label htmlFor="pin-seed">{t("recovery-pin")}</Label>
                <Input
                  id="pin-seed"
                  type="password"
                  inputMode="numeric"
                  placeholder="······"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null) }}
                  autoComplete="one-time-code"
                  className="rounded-xl"
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl"
                disabled={loading || !mnemonic.trim() || pin.length < 6}
              >
                {loading
                  ? <><Spinner className="mr-2" />{t("recovering")}</>
                  : t("recovery-import-wallet")}
              </Button>
            </form>
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
            <Label htmlFor="pin-no-backup">{t("recovery-pin")}</Label>
            <Input
              id="pin-no-backup"
              type="password"
              inputMode="numeric"
              placeholder="······"
              maxLength={8}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null) }}
              autoComplete="one-time-code"
              className="rounded-xl"
            />
          </div>

          <Button
            className="w-full rounded-xl"
            onClick={handleImportSeed}
            disabled={loading || !mnemonic.trim() || pin.length < 6}
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
