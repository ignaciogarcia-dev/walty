"use client"

import { useState } from "react"
import { Check, CopySimple, X } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { copyToClipboard } from "@/utils/copyToClipboard"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTranslation } from "@/hooks/useTranslation"
import { useWalletContext } from "@/components/wallet/context"
import { useUnlockFlow } from "@/hooks/useUnlockFlow"
import { truncateLink } from "@/utils/url"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInviteCreated?: () => void
}

export function InviteModal({ open, onOpenChange, onInviteCreated }: Props) {
  const { t } = useTranslation()
  const { deriveOperatorAddress } = useWalletContext()
  const { ensureUnlocked, unlockDialog } = useUnlockFlow()

  const [inviteUrl, setInviteUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generated, setGenerated] = useState(false)

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => {
      setInviteUrl("")
      setError(null)
      setCopied(false)
      setGenerated(false)
    }, 300)
  }

  async function handleGenerate() {
    setError(null)
    setLoading(true)

    try {
      // Gate: wallet must be unlocked to derive the operator address
      const unlocked = await ensureUnlocked()
      if (!unlocked) {
        setLoading(false)
        return
      }

      // Step 1: get next available derivation index
      const indexRes = await fetch("/api/business/members/next-index")
      if (!indexRes.ok) throw new Error(t("error-creating-invite"))
      const { data: { nextIndex } } = await indexRes.json()

      // Step 2: derive operator address client-side from owner's seed
      const walletAddress = await deriveOperatorAddress(nextIndex)

      // Step 3: create invite with wallet already assigned
      const inviteRes = await fetch("/api/business/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "cashier",
          walletAddress,
          derivationIndex: nextIndex,
        }),
      })

      if (!inviteRes.ok) {
        const data = await inviteRes.json()
        throw new Error(data.error ?? t("error-creating-invite"))
      }

      const { data } = await inviteRes.json()
      const fullUrl = `${window.location.origin}${data.inviteUrl}`
      setInviteUrl(fullUrl)
      setGenerated(true)
      onInviteCreated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error-creating-invite"))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await copyToClipboard(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md rounded-2xl border bg-card p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {generated ? t("invite-link") : t("invite-operator")}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8 text-muted-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!generated ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("invite-cashier-description")}</p>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                {t("invite-wallet-note")}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={handleGenerate} disabled={loading} className="w-full rounded-xl">
                {loading ? (
                  <><Spinner className="mr-2 size-4" />{t("generating")}</>
                ) : (
                  t("generate-link")
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("invite-share-instruction")}</p>
              <div className="flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-muted/30 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-mono text-foreground">{truncateLink(inviteUrl)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <CopySimple className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <Button onClick={handleClose} variant="outline" className="w-full rounded-xl">
                {t("close")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {unlockDialog}
    </>
  )
}
