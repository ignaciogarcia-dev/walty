"use client"
import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { mnemonicToAccount } from "viem/accounts"
import { useSearchParams, useRouter } from "next/navigation"
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
import { unwrap } from "@/lib/api/unwrap"
import { usePairing } from "@/hooks/usePairing"
import { getDeviceShareMeta } from "@/lib/mpc/deviceShareStore"
import { importBackupShare, type BackupExport } from "@/lib/mpc/backupShare"
import { useOnboarding } from "../context"

type RecoveryMode = "pin" | "seed" | "kit"

export default function RecoverPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const invalidLocal = searchParams.get("reason") === "invalid-local"
  const [mode, setMode] = useState<RecoveryMode>("pin")
  const [pin, setPin] = useState("")
  const [mnemonic, setMnemonic] = useState("")
  const [kitFile, setKitFile] = useState<File | null>(null)
  const [kitPassword, setKitPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { state: pairingState, requestPairing } = usePairing()
  const { setMpc } = useOnboarding()

  const { data: backupData, isLoading: checkingBackup } = useQuery({
    queryKey: ["wallet-backup-check"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/backup")
      if (res.status === 403) return "gated"
      if (!res.ok) return null
      return unwrap<unknown>(await res.json()) ?? null
    },
    staleTime: Infinity,
    retry: false,
  })
  const hasBackup = backupData !== null && backupData !== undefined

  const { data: localMpcShare, isLoading: checkingLocalShare } = useQuery({
    queryKey: ["local-mpc-share-check"],
    queryFn: () => getDeviceShareMeta(),
    staleTime: Infinity,
    retry: false,
  })
  const hasMpcShareLocally = localMpcShare !== null && localMpcShare !== undefined

  const { data: mpcKeyData, isLoading: checkingMpcKey } = useQuery({
    queryKey: ["wallet-mpc-key-check"],
    queryFn: async () => {
      const res = await fetch("/api/mpc-key")
      if (!res.ok) return null
      return unwrap<{ keyId: string | null; address: string | null }>(await res.json())
    },
    staleTime: Infinity,
    retry: false,
  })
  const hasMpcKey = !!mpcKeyData?.keyId

  async function persistRecoveredWallet(seedPhrase: string, address: string) {
    if (pin.length < 6) {
      throw new Error(t("pin-too-short"))
    }
    const encrypted = await encryptSeedV3(seedPhrase, pin)
    await saveWallet({ encrypted, address } satisfies StoredWalletV3)
    window.location.assign("/dashboard")
  }

  async function pullBackupAndPersist(): Promise<"done" | "gated"> {
    const backupRes = await fetch("/api/wallet/backup")
    if (backupRes.status === 403) return "gated"
    if (!backupRes.ok) throw new Error(t("error-recovering-wallet"))

    const backup = unwrap<EncryptedSeedV3 | null>(await backupRes.json())
    if (!backup) throw new Error(t("error-recovering-wallet"))

    const recoveredMnemonic = await decryptSeedV3(backup, pin)
    const addr = mnemonicToAccount(recoveredMnemonic).address
    await persistRecoveredWallet(recoveredMnemonic, addr)
    return "done"
  }

  const handleRecoverWithPin = async () => {
    setError(null)
    setLoading(true)
    try {
      if ((await pullBackupAndPersist()) === "gated") {
        const approved = await requestPairing()
        if (!approved) {
          setError(t("pairing-not-approved"))
          return
        }
        if ((await pullBackupAndPersist()) === "gated") {
          throw new Error(t("error-recovering-wallet"))
        }
      }
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

  const handleRecoverWithKit = async () => {
    setError(null)
    if (!kitFile) {
      setError(t("recovery-kit-no-file"))
      return
    }
    if (!kitPassword) {
      setError(t("recovery-kit-no-password"))
      return
    }
    setLoading(true)
    try {
      // Parse and decrypt the recovery kit file
      const text = await kitFile.text()
      let kitExport: BackupExport
      try {
        kitExport = JSON.parse(text) as BackupExport
      } catch {
        throw new Error(t("recovery-kit-invalid-file"))
      }
      if (!kitExport.format?.startsWith("walty-backup-share")) {
        throw new Error(t("recovery-kit-invalid-file"))
      }

      let backupShareBytes: Uint8Array
      try {
        backupShareBytes = await importBackupShare(kitExport, kitPassword)
      } catch {
        throw new Error(t("recovery-kit-wrong-password"))
      }

      // Server runs all 3 DKLS parties locally (avoids web→node WASM incompatibility)
      let _b64str = ""
      for (let i = 0; i < backupShareBytes.length; i++) _b64str += String.fromCharCode(backupShareBytes[i])
      const backupB64 = btoa(_b64str)
      const res = await fetch("/api/mpc-recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Forward the kit's generation (v2 kits) so the server can reject a stale
        // kit up front; undefined for legacy v1 kits.
        body: JSON.stringify({ backupShare: backupB64, generation: kitExport.generation }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Map known error codes to localized copy; never surface raw internal
        // server messages (e.g. "No MPC key found for this user") to the user.
        if (body?.message === "recovery_kit_outdated") {
          throw new Error(t("recovery-kit-outdated"))
        }
        throw new Error(t("error-recovering-wallet"))
      }
      // Recovery advanced the polynomial: the server returns a NEW device share
      // and a NEW backup share (the uploaded kit is now stale). We must re-issue
      // the kit before finishing, so route through recovery-kit, not create-pin.
      const {
        keyId,
        deviceShare,
        backupShare: newBackupShare,
        generation: newGen,
        commitToken,
        pubkey,
        address,
      } = await res.json()
      const deviceShareBytes = Uint8Array.from(atob(deviceShare), (c) => c.charCodeAt(0))
      const newBackupShareBytes = Uint8Array.from(atob(newBackupShare), (c) => c.charCodeAt(0))

      // The server staged the advanced share; it's committed only after the new
      // kit is downloaded (recovery-kit) and the device share saved (create-pin).
      setMpc({
        keyId,
        deviceShareBytes,
        backupShareBytes: newBackupShareBytes,
        pubkey,
        address,
        generation: newGen,
        recoverToken: commitToken,
      })
      router.push("/onboarding/recovery-kit")
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("error-recovering-wallet")
      const reason = (err as { reason?: string }).reason
      setError(reason ? `${msg} [${reason}]` : msg)
    } finally {
      setLoading(false)
    }
  }

  if (checkingBackup || checkingLocalShare || checkingMpcKey) {
    return (
      <OnboardingShell>
        <div className="flex flex-col items-center gap-4 py-4">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">{t("checking")}</p>
        </div>
      </OnboardingShell>
    )
  }

  // MPC device share already stored locally — user should unlock via lock screen.
  if (hasMpcShareLocally) {
    return (
      <OnboardingShell>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("onboarding-recover-title")}</h2>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
          <p className="font-medium">{t("recovery-mpc-local-title")}</p>
          <p className="mt-1 text-xs">{t("recovery-mpc-local-description")}</p>
        </div>
        <Button
          className="w-full rounded-xl"
          onClick={() => window.location.assign("/dashboard")}
        >
          {t("go-to-dashboard")}
        </Button>
      </OnboardingShell>
    )
  }

  // MPC user without local share → recovery kit is the right path.
  if (hasMpcKey) {
    return (
      <OnboardingShell>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("onboarding-recover-title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("recovery-kit-description")}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{t("recovery-kit-file-label")}</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setKitFile(f)
                setError(null)
              }}
            />
            <Button
              variant="outline"
              className="w-full rounded-xl justify-start font-normal"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              {kitFile ? kitFile.name : t("recovery-kit-choose-file")}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kit-password">{t("recovery-kit-password-label")}</Label>
            <Input
              id="kit-password"
              type="password"
              placeholder="••••••••••••"
              value={kitPassword}
              onChange={(e) => { setKitPassword(e.target.value); setError(null) }}
              disabled={loading}
              className="rounded-xl"
            />
          </div>

          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

          <Button
            className="w-full rounded-xl"
            onClick={handleRecoverWithKit}
            disabled={loading || !kitFile || !kitPassword}
          >
            {loading
              ? <><Spinner className="mr-2" />{t("recovering")}</>
              : t("recover-wallet")}
          </Button>
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

              {pairingState === "waiting" && (
                <div className="flex flex-col gap-2">
                  <p role="status" data-testid="pairing-wait" className="text-xs text-muted-foreground">
                    {t("pairing-waiting")}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline w-fit"
                    onClick={() => { setMode("seed"); setError(null) }}
                  >
                    {t("recovery-with-seed")}
                  </button>
                </div>
              )}

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

      <p role="alert" className="text-xs text-destructive">{error ?? ''}</p>
    </OnboardingShell>
  )
}
