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
import { finalizeBackupShare } from "@/lib/mpc/backupShare"

const MIN_RECOVERY_PASSWORD = 12

export default function RecoveryKitPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mpc, setMpc, completed } = useOnboarding()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    if (!mpc && !completed) {
      router.replace("/onboarding/create-wallet?reason=reloaded")
    }
  }, [mpc, completed, router])

  if (!mpc) return null

  const handleDownload = async () => {
    setError(null)
    if (password.length < MIN_RECOVERY_PASSWORD) {
      setError(t("onboarding-recovery-password-too-short"))
      return
    }
    if (password !== confirm) {
      setError(t("onboarding-recovery-password-mismatch"))
      return
    }
    if (!mpc.backupShareBytes) {
      setError(t("unexpected-error"))
      return
    }

    setLoading(true)
    try {
      // export → verify → zeroize the in-memory backup share, then download it.
      const exported = await finalizeBackupShare(mpc.backupShareBytes, password)
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "walty-recovery-kit.json"
      a.click()
      URL.revokeObjectURL(url)

      // Backup share is now zeroized — drop it from context.
      setMpc({ ...mpc, backupShareBytes: null })
      setDownloaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unexpected-error"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t("onboarding-recovery-kit-title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("onboarding-recovery-kit-description")}
        </p>
      </div>

      {!downloaded ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recovery-password">
                {t("onboarding-recovery-password")}
              </Label>
              <Input
                id="recovery-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                {t("onboarding-recovery-password-hint")}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recovery-password-confirm">
                {t("onboarding-recovery-password-confirm")}
              </Label>
              <Input
                id="recovery-password-confirm"
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setError(null)
                }}
                className="rounded-xl"
              />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            className="w-full rounded-xl"
            onClick={handleDownload}
            disabled={loading || password.length < MIN_RECOVERY_PASSWORD}
          >
            {loading ? (
              <>
                <Spinner className="mr-2" />
                {t("setting-up-wallet")}
              </>
            ) : (
              t("onboarding-download-kit")
            )}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("onboarding-kit-saved-warning")}
          </p>
          <Button
            className="w-full rounded-xl"
            onClick={() => router.replace("/onboarding/create-pin")}
          >
            {t("onboarding-kit-saved-continue")}
          </Button>
        </>
      )}
    </OnboardingShell>
  )
}
