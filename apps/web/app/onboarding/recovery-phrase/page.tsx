"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { OnboardingShell } from "../_components/shell"
import { useOnboarding } from "../context"
import { useTranslation } from "@/hooks/useTranslation"
import { ClipboardIcon } from "lucide-react"
import { copyToClipboard } from "@/utils/copyToClipboard"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function RecoveryPhrasePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { mnemonic, completed } = useOnboarding()
  const [copied, setCopied] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)

  useEffect(() => {
    if (!mnemonic && !completed) {
      router.replace("/onboarding/create-wallet?reason=reloaded")
    }
  }, [mnemonic, completed, router])

  if (!mnemonic) return null

  const words = mnemonic.split(" ")

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboarding-recovery-phrase-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding-recovery-phrase-description")}</p>
      </div>


      <div className="grid grid-cols-3 gap-2 select-none">
        {words.map((word, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded-2xl border bg-muted/50 px-2.5 py-2"
          >
            <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
            <span className="text-sm font-mono font-medium text-foreground">{word}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={async () => {
            await copyToClipboard(mnemonic)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          <ClipboardIcon className="size-4" />
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) setConfirmChecked(false)
        }}
      >
        <Button
          className="w-full rounded-xl"
          onClick={() => setConfirmOpen(true)}
        >
          {t("onboarding-i-saved-phrase")}
        </Button>
        <DialogContent className="max-w-sm rounded-3xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("onboarding-confirm-title")}</DialogTitle>
            <DialogDescription>
              {t("onboarding-confirm-description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-3">
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border"
                checked={confirmChecked}
                onChange={(event) => setConfirmChecked(event.target.checked)}
              />
              <span className="space-y-1">
                <span className="block font-medium">
                  {t("onboarding-confirm-checkbox")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("onboarding-confirm-understand-risk")}
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button
              className="w-full rounded-2xl"
              disabled={!confirmChecked}
              onClick={() => {
                router.push("/onboarding/confirm-recovery")
              }}
            >
              {t("onboarding-yes-saved")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OnboardingShell>
  )
}
