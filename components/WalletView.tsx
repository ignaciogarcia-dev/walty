"use client"
import { useEffect, useState } from "react"
import type { TxStatus, TxRecord } from "@/hooks/useWallet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useTranslation } from "@/hooks/useTranslation"

const EXPLORER_BASE = "https://sepolia.etherscan.io/tx"

function ExplorerLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${EXPLORER_BASE}/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground break-all"
    >
      {hash.slice(0, 12)}…{hash.slice(-8)} ↗
    </a>
  )
}

export function WalletView({
  address,
  balance,
  onLock,
  onExport,
  onEstimateGas,
  onSend,
  onResetTx,
  txStatus,
  txHash,
  txError,
  txHistory,
}: {
  address: string | null
  balance: string | null
  onLock: () => void
  onExport: () => void
  onEstimateGas: (to: string, amount: string) => Promise<string>
  onSend: (to: string, amount: string) => Promise<void>
  onResetTx: () => void
  txStatus: TxStatus
  txHash: string | null
  txError: string | null
  txHistory: TxRecord[]
}) {
  const { t } = useTranslation()
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [gasEstimate, setGasEstimate] = useState<string | null>(null)
  const [gasError, setGasError] = useState<string | null>(null)

  useEffect(() => {
    if (txStatus === "confirmed") {
      setTo("")
      setAmount("")
    }
  }, [txStatus])

  async function handleOpenModal() {
    if (!to || !amount) return
    setGasEstimate(null)
    setGasError(null)
    setShowModal(true)
    try {
      const estimate = await onEstimateGas(to, amount)
      setGasEstimate(estimate)
    } catch {
      setGasError(t("could-not-estimate-gas"))
    }
  }

  async function handleConfirm() {
    setShowModal(false)
    await onSend(to, amount)
  }

  const isBusy = txStatus === "pending" || txStatus === "pending_on_chain"

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">

        {/* Header row: network badge + actions */}
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1.5 font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
            Sepolia — TESTNET
          </Badge>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onExport}>
              {t("export-backup")}
            </Button>
            <Button size="sm" variant="outline" onClick={onLock}>
              {t("lock")}
            </Button>
          </div>
        </div>

        {/* Balance card */}
        <div className="rounded-xl border bg-card p-6 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{t("balance")}</p>
          <p className="text-4xl font-bold text-foreground tabular-nums">
            {balance ?? <span className="text-muted-foreground">—</span>}
            <span className="ml-2 text-lg font-medium text-muted-foreground">ETH</span>
          </p>
          {address && (
            <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{address}</p>
          )}
        </div>

        {/* Send form */}
        <div className="rounded-xl border bg-card p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-foreground">{t("send-eth")}</h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-to">{t("destination-address")}</Label>
            <Input
              id="tx-to"
              type="text"
              placeholder="0x..."
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-amount">{t("amount-eth")}</Label>
            <Input
              id="tx-amount"
              type="text"
              placeholder="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <Button onClick={handleOpenModal} disabled={isBusy || !to || !amount} className="w-full">
            {isBusy ? (
              <>
                <Spinner />
                {t("sending")}
              </>
            ) : (
              t("send-eth")
            )}
          </Button>

          {/* Transaction status */}
          {(txStatus === "pending" || txStatus === "pending_on_chain") && (
            <Alert>
              <Spinner />
              <AlertTitle>
                {txStatus === "pending" ? t("transaction-pending") : t("on-network-waiting")}
              </AlertTitle>
              {txHash && (
                <AlertDescription>
                  <ExplorerLink hash={txHash} />
                </AlertDescription>
              )}
            </Alert>
          )}

          {txStatus === "confirmed" && (
            <div className="flex flex-col gap-1 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-green-700 dark:text-green-400">{t("confirmed")}</span>
                <Button size="icon-sm" variant="ghost" onClick={onResetTx} aria-label={t("dismiss")} className="text-green-600 hover:text-green-800 -mr-1">
                  ×
                </Button>
              </div>
              {txHash && <ExplorerLink hash={txHash} />}
            </div>
          )}

          {txStatus === "error" && (
            <Alert variant="destructive">
              <AlertTitle className="flex items-center justify-between">
                <span>{t("error")}</span>
                <Button size="icon-sm" variant="ghost" onClick={onResetTx} aria-label={t("dismiss")} className="text-destructive hover:text-destructive/80 -mr-1 -mt-1">
                  ×
                </Button>
              </AlertTitle>
              {txError && <AlertDescription>{txError}</AlertDescription>}
            </Alert>
          )}
        </div>

        {/* Transaction history */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground shrink-0">{t("history")}</h2>
            <Separator className="flex-1" />
          </div>

          {txHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("no-transactions-yet")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {txHistory.map((tx) => (
                <div key={tx.id} className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        tx.status === "confirmed" ? "default" :
                        tx.status === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {tx.status === "confirmed" ? t("confirmed") : tx.status === "failed" ? t("failed") : t("pending")}
                    </Badge>
                    <span className="font-mono text-sm font-semibold">{tx.amount} ETH</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground break-all">→ {tx.toAddress}</p>
                  <ExplorerLink hash={tx.txHash} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("confirm-transaction")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <Badge variant="outline" className="w-fit gap-1.5 font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
              Sepolia — TESTNET
            </Badge>

            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">{t("destination")}</p>
              <p className="font-mono text-sm break-all">{to}</p>
            </div>

            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">{t("amount")}</p>
              <p className="font-mono font-semibold">{amount} ETH</p>
            </div>

            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">{t("estimated-gas")}</p>
              {gasEstimate === null && !gasError ? (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <Spinner className="size-3" />
                  {t("calculating")}
                </div>
              ) : gasError ? (
                <p className="text-sm text-destructive">{gasError}</p>
              ) : (
                <p className="font-mono text-sm">~{gasEstimate} ETH</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">
              {t("cancel")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={gasEstimate === null && !gasError}
              className="flex-1"
            >
              {t("confirm-send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
