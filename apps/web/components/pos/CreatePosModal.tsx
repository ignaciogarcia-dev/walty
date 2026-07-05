"use client"

import { useState } from "react"
import { Check, CopySimple, DownloadSimple, Warning, X } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { copyToClipboard } from "@/utils/copyToClipboard"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useTranslation } from "@/hooks/useTranslation"
import { useWalletContext } from "@/components/wallet/context"
import { useBusinessContext } from "@/hooks/useBusinessContext"
import { useUnlockFlow } from "@/hooks/useUnlockFlow"
import { generatePosKeypair } from "@/lib/pos/keys"
import { unwrap } from "@/lib/api/unwrap"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

type Credentials = {
  posId: number
  apiBaseUrl: string
  privateKey: string
}

export function CreatePosModal({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation()
  const { deriveOperatorAddress, deriveCashierAddress } = useWalletContext()
  const { isMpc } = useBusinessContext()
  const { ensureUnlocked, unlockDialog } = useUnlockFlow()

  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [credentials, setCredentials] = useState<Credentials | null>(null)

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => {
      setName("")
      setError(null)
      setCopied(false)
      setCredentials(null)
    }, 300)
  }

  async function handleCreate() {
    setError(null)
    if (!name.trim()) {
      setError(t("pos-name-required"))
      return
    }
    setLoading(true)

    try {
      // Deriving the terminal's child wallet needs the owner's unlocked device.
      const unlocked = await ensureUnlocked()
      if (!unlocked) {
        setLoading(false)
        return
      }

      const indexRes = await fetch("/api/business/pos/next-index")
      if (!indexRes.ok) throw new Error(t("pos-create-error"))
      const { nextIndex } = unwrap<{ nextIndex: number }>(await indexRes.json())

      // HD child (m/index) via the owner MPC quorum (or seed for legacy custody).
      const walletAddress = isMpc
        ? await deriveCashierAddress(nextIndex)
        : await deriveOperatorAddress(nextIndex)

      // The keypair is generated locally; only the public key leaves the browser.
      const { privateKeyHex, publicKeyHex } = await generatePosKeypair()

      const res = await fetch("/api/business/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          publicKey: publicKeyHex,
          derivationIndex: nextIndex,
          walletAddress,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? t("pos-create-error"))
      }
      const device = unwrap<{ id: number }>(await res.json())

      setCredentials({
        posId: device.id,
        apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
        privateKey: privateKeyHex,
      })
      onCreated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pos-create-error"))
    } finally {
      setLoading(false)
    }
  }

  const configJson = credentials
    ? JSON.stringify(
        {
          posId: credentials.posId,
          apiBaseUrl: credentials.apiBaseUrl,
          privateKey: credentials.privateKey,
        },
        null,
        2,
      )
    : ""

  async function handleCopyConfig() {
    await copyToClipboard(configJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleDownload() {
    const blob = new Blob([configJson], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pos-${credentials?.posId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md rounded-2xl border bg-card p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {credentials ? t("pos-credentials-title") : t("pos-create-title")}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!credentials ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("pos-create-description")}</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("pos-name-placeholder")}
                maxLength={64}
                className="w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={handleCreate} disabled={loading} className="w-full rounded-xl">
                {loading ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    {t("pos-creating")}
                  </>
                ) : (
                  t("pos-create-cta")
                )}
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                <Warning className="mt-0.5 size-4 shrink-0" />
                <span>{t("pos-key-warning")}</span>
              </div>

              <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
                <p className="mb-1 text-xs text-muted-foreground">{t("pos-private-key")}</p>
                <p className="break-all font-mono text-xs text-foreground">
                  {credentials.privateKey}
                </p>
              </div>

              <pre className="min-w-0 whitespace-pre-wrap break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {configJson}
              </pre>

              <div className="flex gap-2">
                <Button onClick={handleCopyConfig} variant="outline" className="flex-1 rounded-xl">
                  {copied ? (
                    <>
                      <Check className="mr-2 size-4 text-green-500" />
                      {t("copied")}
                    </>
                  ) : (
                    <>
                      <CopySimple className="mr-2 size-4" />
                      {t("pos-copy-config")}
                    </>
                  )}
                </Button>
                <Button onClick={handleDownload} variant="outline" className="flex-1 rounded-xl">
                  <DownloadSimple className="mr-2 size-4" />
                  {t("pos-download-config")}
                </Button>
              </div>

              <Button onClick={handleClose} className="w-full rounded-xl">
                {t("pos-done")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {unlockDialog}
    </>
  )
}
