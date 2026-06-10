"use client"

import { motion, AnimatePresence } from "motion/react"
import { Check, CopySimple } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PaymentRequestView } from "@walty/shared/payments/types"
import { useTranslation } from "@/hooks/useTranslation"
import { useIsMobile } from "@/hooks/use-mobile"
import { useCollectPayment } from "@/hooks/useCollectPayment"
import { CollectAmountStep } from "./collect/CollectAmountStep"
import { CollectQrStep } from "./collect/CollectQrStep"
import { CollectConfirmedStep } from "./collect/CollectConfirmedStep"

type CollectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantWalletAddress: string | null
  activeRequest?: PaymentRequestView | null
  onRequestChange?: (request: PaymentRequestView | null) => void
}

export function CollectModal({
  open,
  onOpenChange,
  merchantWalletAddress,
  activeRequest = null,
  onRequestChange,
}: CollectModalProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const collect = useCollectPayment({
    open,
    onOpenChange,
    merchantWalletAddress,
    activeRequest,
    onRequestChange,
  })

  const {
    step,
    request,
    copiedLink,
    handleCopyLink,
    handleClose,
  } = collect

  const amountStep = (
    <CollectAmountStep
      amount={collect.amount}
      isSplitPayment={collect.isSplitPayment}
      error={collect.error}
      creating={collect.creating}
      amountValid={collect.amountValid}
      autoFocus={!isMobile}
      onAmountChange={collect.handleAmountChange}
      onToggleSplit={() => collect.setIsSplitPayment(!collect.isSplitPayment)}
      onSubmit={collect.handleCreateRequest}
    />
  )

  const qrStep = request && (
    <CollectQrStep
      request={request}
      copiedAddress={collect.copiedAddress}
      requestStatus={collect.requestStatus}
      countdown={collect.countdown}
      onCopyAddress={collect.handleCopyAddress}
      onReset={collect.resetLocalState}
    />
  )

  const confirmedStep = request && (
    <CollectConfirmedStep
      request={request}
      refundState={collect.refundState}
      refundError={collect.refundError}
      onSetRefundState={collect.setRefundState}
      onRefundSurplus={collect.handleRefundSurplus}
      onReset={collect.resetLocalState}
    />
  )

  const copyLinkButton = request && (
    <Button variant="outline" className="shrink-0 rounded-xl" onClick={handleCopyLink}>
      {copiedLink ? <Check className="mr-2 size-4 text-green-500" /> : <CopySimple className="mr-2 size-4" />}
      {t("copy-link")}
    </Button>
  )

  // mobile: Motion bottom sheet
  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="collect-backdrop"
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => handleClose(false)}
            />
            <motion.div
              key="collect-panel"
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-card border-t max-h-[92vh] pb-[env(safe-area-inset-bottom)]"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="overflow-y-auto px-6 pt-5 pb-20">
                {step === "amount" && (
                  <motion.div
                    key="step-amount"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    <h2 className="text-base font-semibold pt-2">{t("collect-title")}</h2>
                    {amountStep}
                  </motion.div>
                )}

                {step === "qr" && request && (
                  <motion.div
                    key="step-qr"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <h2 className="text-base font-semibold min-w-0 truncate">
                        {t("collect-title")} ${request.amountUsd} {request.tokenSymbol}
                      </h2>
                      {copyLinkButton}
                    </div>
                    {qrStep}
                  </motion.div>
                )}

                {step === "confirmed" && request && (
                  <motion.div
                    key="step-confirmed"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    <h2 className="text-base font-semibold pt-2">{t("payment-received")}</h2>
                    {confirmedStep}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  // desktop: Dialog
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-[360px] overflow-hidden rounded-4xl border bg-card p-6 shadow-sm sm:max-w-[420px]">
        {step === "amount" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("collect-title")}</DialogTitle>
            </DialogHeader>
            {amountStep}
          </>
        )}
        {step === "qr" && request && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {t("collect-title")} ${request.amountUsd} {request.tokenSymbol}
                </span>
                {copyLinkButton}
              </DialogTitle>
            </DialogHeader>
            {qrStep}
          </>
        )}
        {step === "confirmed" && request && (
          <>
            <DialogHeader>
              <DialogTitle>{t("payment-received")}</DialogTitle>
            </DialogHeader>
            {confirmedStep}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
