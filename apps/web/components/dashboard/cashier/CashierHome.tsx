"use client"

import { ActivePaymentRequestCard } from "@/components/dashboard/ActivePaymentRequestCard"
import { BusinessContextBanner } from "@/components/business/BusinessContextBanner"
import { CollectModal } from "@/components/pos/CollectModal"
import { CashierMovementsFeed } from "./CashierMovementsFeed"
import { useCollectFlow } from "@/hooks/useCollectFlow"
import { useTranslation } from "@/hooks/useTranslation"
import type { BusinessRole } from "@/hooks/useBusinessContext"
import { ArrowCounterClockwise, QrCode } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter } from "next/navigation"

type Props = {
  merchantWalletAddress: string
  role: BusinessRole
  businessName: string
}

const quickActionClassName =
  "flex-1 cursor-pointer rounded-2xl border border-quick-action-border bg-quick-action-surface text-quick-action-foreground backdrop-blur-md transition-all hover:border-quick-action-hover-border hover:bg-quick-action-hover"

export function CashierHome({ merchantWalletAddress, role, businessName }: Props) {
  const router = useRouter()
  const { t } = useTranslation()

  const {
    collectOpen,
    setCollectOpen,
    activeRequest,
    activeRequestPending,
    handleRequestChange,
    clearActiveRequest,
  } = useCollectFlow()

  return (
    <>
      {role && businessName && (
        <BusinessContextBanner role={role} businessName={businessName} />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button
            onClick={() => setCollectOpen(true)}
            variant="ghost"
            className={quickActionClassName}
            size="lg"
            disabled={!merchantWalletAddress}
          >
            <QrCode className="mr-2 h-4 w-4" />
            {t("collect")}
          </Button>
          <Button
            onClick={() => router.push("/dashboard/business/refunds")}
            variant="ghost"
            className={quickActionClassName}
            size="lg"
          >
            <ArrowCounterClockwise className="mr-2 h-4 w-4" />
            {t("refund")}
          </Button>
        </div>
        {!merchantWalletAddress && (
          <p className="text-xs text-muted-foreground text-center">{t("collect-no-wallet")}</p>
        )}
      </div>

      <CollectModal
        open={collectOpen}
        onOpenChange={setCollectOpen}
        merchantWalletAddress={merchantWalletAddress}
        activeRequest={activeRequest}
        onRequestChange={handleRequestChange}
      />

      {activeRequestPending && !activeRequest && (
        <Skeleton className="h-40 w-full rounded-4xl" />
      )}
      {activeRequest && (
        <ActivePaymentRequestCard
          request={activeRequest}
          onOpenQr={() => setCollectOpen(true)}
          onCancel={clearActiveRequest}
        />
      )}

      {role === "cashier" && <CashierMovementsFeed />}
    </>
  )
}
