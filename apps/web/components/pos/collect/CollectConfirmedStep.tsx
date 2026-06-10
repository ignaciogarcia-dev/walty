"use client"

import { formatUnits } from "viem"
import {
  ArrowURightDown,
  Check,
  CheckCircle,
  Warning,
} from "@phosphor-icons/react"
import { PAYMENT_CHAIN_ID } from "@walty/shared/payments/config"
import type { PaymentRequestView } from "@walty/shared/payments/types"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { getTxUrl } from "@/lib/explorer/getTxUrl"
import { useTranslation } from "@/hooks/useTranslation"
import { cn } from "@/utils/style"
import type { RefundState } from "@/hooks/useCollectPayment"
import { truncateAddress, truncateHash } from "./format"

interface CollectConfirmedStepProps {
  request: PaymentRequestView
  refundState: RefundState
  refundError: string | null
  onSetRefundState: (state: RefundState) => void
  onRefundSurplus: () => void
  onReset: () => void
}

export function CollectConfirmedStep({
  request,
  refundState,
  refundError,
  onSetRefundState,
  onRefundSurplus,
  onReset,
}: CollectConfirmedStepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {!request.isSplitPayment && request.paymentDiscrepancy === "exact" && (
        <CheckCircle size={64} weight="fill" className="text-green-500" />
      )}
      {!request.isSplitPayment && request.paymentDiscrepancy === "overpaid" && (
        <Warning size={64} weight="fill" className="text-amber-500" />
      )}
      {!request.isSplitPayment && request.paymentDiscrepancy === "underpaid" && (
        <Warning size={64} weight="fill" className="text-orange-500" />
      )}
      {(request.isSplitPayment || !request.paymentDiscrepancy) && (
        <CheckCircle size={64} weight="fill" className="text-green-500" />
      )}
      <p className="text-2xl font-semibold">
        {request.receivedAmountUsd
          ? `${parseFloat(request.receivedAmountUsd).toFixed(6).replace(/\.?0+$/, "")} ${request.tokenSymbol}`
          : `${request.amountUsd} ${request.tokenSymbol}`}
      </p>
      {!request.isSplitPayment && request.paymentDiscrepancy && request.paymentDiscrepancy !== "exact" && (
        <div className={cn(
          "w-full rounded-xl border p-4 space-y-2",
          request.paymentDiscrepancy === "overpaid" ? "border-amber-400/40 bg-amber-50/10" : "border-orange-400/40 bg-orange-50/10"
        )}>
          <p className={cn("text-sm font-semibold", request.paymentDiscrepancy === "overpaid" ? "text-amber-500" : "text-orange-500")}>
            {request.paymentDiscrepancy === "overpaid" ? t("payment-overpaid") : t("payment-underpaid")}
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("payment-expected")}</span>
              <span className="font-mono font-medium">{request.amountUsd} {request.tokenSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("payment-received-label")}</span>
              <span className="font-mono font-medium">
                {request.receivedAmountUsd
                  ? `${parseFloat(request.receivedAmountUsd).toFixed(6).replace(/\.?0+$/, "")} ${request.tokenSymbol}`
                  : "—"}
              </span>
            </div>
            {request.paymentDiscrepancy === "overpaid" && request.receivedAmountToken && (
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-amber-500 font-medium">{t("payment-surplus")}</span>
                <span className="font-mono font-medium text-amber-500">
                  {formatUnits(BigInt(request.receivedAmountToken) - BigInt(request.amountToken), request.tokenDecimals).replace(/\.?0+$/, "")} {request.tokenSymbol}
                </span>
              </div>
            )}
            {request.paymentDiscrepancy === "underpaid" && request.receivedAmountToken && (
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-orange-500 font-medium">{t("payment-shortfall")}</span>
                <span className="font-mono font-medium text-orange-500">
                  {formatUnits(BigInt(request.amountToken) - BigInt(request.receivedAmountToken), request.tokenDecimals).replace(/\.?0+$/, "")} {request.tokenSymbol}
                </span>
              </div>
            )}
          </div>
          {request.paymentDiscrepancy === "overpaid" && request.payerAddress && (
            <div className="pt-2">
              {refundState === "idle" && (
                <Button variant="outline" size="sm" className="w-full rounded-lg border-amber-400/40 text-amber-600 hover:bg-amber-50/20" onClick={() => onSetRefundState("confirming")}>
                  <ArrowURightDown className="mr-2 size-4" />{t("refund-surplus")}
                </Button>
              )}
              {refundState === "confirming" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("refund-surplus-confirm")
                      .replace("{amount}", formatUnits(BigInt(request.receivedAmountToken!) - BigInt(request.amountToken), request.tokenDecimals).replace(/\.?0+$/, ""))
                      .replace("{token}", request.tokenSymbol)
                      .replace("{address}", truncateAddress(request.payerAddress))}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 rounded-lg" onClick={onRefundSurplus}>{t("refund-surplus")}</Button>
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => onSetRefundState("idle")}>{t("cancel")}</Button>
                  </div>
                </div>
              )}
              {refundState === "sending" && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />{t("refunding-surplus")}
                </div>
              )}
              {refundState === "done" && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                  <Check className="size-4" />{t("refund-surplus-success")}
                </div>
              )}
              {refundState === "error" && (
                <p className="text-xs text-center text-destructive">{refundError}</p>
              )}
            </div>
          )}
        </div>
      )}
      {request.isSplitPayment && request.contributions && request.contributions.length > 0 && (
        <div className="w-full rounded-xl border bg-secondary/20 p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("contributions-received")}</p>
          <div className="space-y-2">
            {request.contributions.map((contribution) => (
              <div key={contribution.id} className="flex items-center justify-between rounded-lg border bg-background p-2 text-xs">
                <div className="flex flex-col">
                  <span className="font-mono text-muted-foreground">{truncateAddress(contribution.payerAddress)}</span>
                  <span className="text-muted-foreground">{contribution.amountUsd} {contribution.tokenSymbol}</span>
                </div>
                {contribution.txHash && (
                  <a href={getTxUrl(contribution.txHash, PAYMENT_CHAIN_ID)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
                    {truncateHash(contribution.txHash)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!request.isSplitPayment && request.txHash && (
        <a href={getTxUrl(request.txHash, PAYMENT_CHAIN_ID)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
          {truncateHash(request.txHash)}
        </a>
      )}
      <Button className="w-full rounded-xl" onClick={onReset}>{t("new-collection")}</Button>
    </div>
  )
}
