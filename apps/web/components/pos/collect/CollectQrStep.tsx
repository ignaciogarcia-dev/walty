"use client"

import { QRCodeSVG } from "qrcode.react"
import { ArrowClockwise, Check, CopySimple, Users } from "@phosphor-icons/react"
import { PAYMENT_CHAIN_ID } from "@walty/shared/payments/config"
import type { PaymentRequestView } from "@walty/shared/payments/types"
import { getPaymentRequestStatus } from "@walty/shared/payments/types"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { getTxUrl } from "@/lib/explorer/getTxUrl"
import { useTranslation } from "@/hooks/useTranslation"
import { cn } from "@/utils/style"
import { truncateAddress, truncateHash } from "./format"

interface CollectQrStepProps {
  request: PaymentRequestView
  copiedAddress: boolean
  requestStatus: ReturnType<typeof getPaymentRequestStatus>
  countdown: { expired: boolean; label: string; seconds: number }
  onCopyAddress: () => void
  onReset: () => void
}

export function CollectQrStep({
  request,
  copiedAddress,
  requestStatus,
  countdown,
  onCopyAddress,
  onReset,
}: CollectQrStepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="rounded-2xl border bg-white p-4 shadow-xs">
        <QRCodeSVG value={request.merchantWalletAddress} size={160} level="M" includeMargin={false} />
      </div>
      <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-secondary/20 px-4 py-3">
        <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">
          {truncateAddress(request.merchantWalletAddress)}
        </span>
        <button type="button" onClick={onCopyAddress} className="shrink-0 text-muted-foreground hover:text-foreground">
          {copiedAddress ? <Check size={16} className="text-green-500" /> : <CopySimple size={16} />}
        </button>
      </div>
      {request.isSplitPayment && (
        <div className="w-full rounded-2xl border bg-secondary/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <span className="text-sm font-medium">{t("split-payment")}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("total-to-pay")}</span>
              <span className="font-medium">{request.amountUsd} {request.tokenSymbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("total-paid")}</span>
              <span className="font-medium text-green-600">{request.totalPaidUsd ?? "0.00"} {request.tokenSymbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("remaining")}</span>
              <span className="font-medium text-amber-600">{request.remainingAmountUsd ?? request.amountUsd} {request.tokenSymbol}</span>
            </div>
          </div>
          {request.contributions && request.contributions.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("contributions")}</p>
              <div className="space-y-2">
                {request.contributions.map((contribution) => (
                  <div key={contribution.id} className="flex items-center justify-between rounded-lg border bg-background p-2 text-xs">
                    <div className="flex flex-col">
                      <span className="font-mono text-muted-foreground">{truncateAddress(contribution.payerAddress)}</span>
                      <span className="text-muted-foreground">{contribution.amountUsd} {contribution.tokenSymbol}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={cn(
                        "text-xs",
                        contribution.status === "confirmed" ? "text-green-600"
                          : contribution.status === "confirming" ? "text-amber-600"
                          : "text-muted-foreground"
                      )}>
                        {contribution.status === "confirmed" ? t("contribution-confirmed")
                          : contribution.status === "confirming" ? t("contribution-confirming")
                          : t("contribution-pending")}
                      </span>
                      {contribution.txHash && (
                        <a href={getTxUrl(contribution.txHash, PAYMENT_CHAIN_ID)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
                          {truncateHash(contribution.txHash)}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex w-full justify-between text-sm text-muted-foreground">
        <span>{t("network-polygon")}</span>
        <span className={cn("font-mono", requestStatus === "expired" ? "text-destructive" : "")}>
          {requestStatus === "confirming"
            ? `${request.confirmations}/${request.requiredConfirmations} ${t("confirmations")}`
            : requestStatus === "expired"
              ? t("expired-label")
              : `${t("expires-in")} ${countdown.label}`}
        </span>
      </div>
      {requestStatus === "pending" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />{t("waiting-for-payment")}
        </p>
      )}
      {requestStatus === "confirming" && (
        <p className="flex items-center gap-2 text-sm text-amber-500">
          <Spinner className="size-4" />{t("payment-detected-confirming")}
        </p>
      )}
      {requestStatus === "expired" && (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-sm text-destructive">{t("collection-expired")}</p>
          <Button variant="outline" className="w-full rounded-xl" onClick={onReset}>
            <ArrowClockwise className="mr-2 size-4" />{t("create-new-collection")}
          </Button>
        </div>
      )}
    </div>
  )
}
