"use client"
import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { useTranslation } from "@/hooks/useTranslation"
import { unwrap } from "@/lib/api/unwrap"
import { getDeviceShareMeta } from "@/lib/mpc/deviceShareStore"
import { importBackupShare, type BackupExport } from "@/lib/mpc/backupShare"
import { useOnboarding } from "../context"

export default function RecoverPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const invalidLocal = searchParams.get("reason") === "invalid-local"
  const [kitFile, setKitFile] = useState<File | null>(null)
  const [kitPassword, setKitPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { setMpc } = useOnboarding()

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

      let backupB64Raw = ""
      for (let i = 0; i < backupShareBytes.length; i++) {
        backupB64Raw += String.fromCharCode(backupShareBytes[i])
      }
      const res = await fetch("/api/mpc-recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupShare: btoa(backupB64Raw),
          generation: kitExport.generation,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body?.message === "recovery_kit_outdated") {
          throw new Error(t("recovery-kit-outdated"))
        }
        throw new Error(t("error-recovering-wallet"))
      }

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

  if (checkingLocalShare || checkingMpcKey) {
    return (
      <OnboardingShell>
        <div className="flex flex-col items-center gap-4 py-4">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">{t("checking")}</p>
        </div>
      </OnboardingShell>
    )
  }

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
        <Button className="w-full rounded-xl" onClick={() => window.location.assign("/dashboard")}>
          {t("go-to-dashboard")}
        </Button>
      </OnboardingShell>
    )
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-recover-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasMpcKey
            ? t("recovery-kit-description")
            : invalidLocal
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

      {!hasMpcKey && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
          <p className="font-medium">{t("recovery-no-backup")}</p>
          <p className="mt-1">{t("recovery-no-backup-description")}</p>
        </div>
      )}

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
            disabled={loading || !hasMpcKey}
          >
            {kitFile ? kitFile.name : t("recovery-kit-choose-file")}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kit-password">{t("recovery-kit-password-label")}</Label>
          <Input
            id="kit-password"
            type="password"
            placeholder="............"
            value={kitPassword}
            onChange={(e) => { setKitPassword(e.target.value); setError(null) }}
            disabled={loading || !hasMpcKey}
            className="rounded-xl"
          />
        </div>

        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

        <Button
          className="w-full rounded-xl"
          onClick={handleRecoverWithKit}
          disabled={loading || !kitFile || !kitPassword || !hasMpcKey}
        >
          {loading
            ? <><Spinner className="mr-2" />{t("recovering")}</>
            : t("recover-wallet")}
        </Button>
      </div>
    </OnboardingShell>
  )
}
