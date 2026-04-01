"use client"

import { BalanceCard } from "@/components/wallet/BalanceCard"
import { ActivePaymentRequestCard } from "@/components/dashboard/ActivePaymentRequestCard"
import { CollectModal } from "@/components/pos/CollectModal"
import { useCollectFlow } from "@/hooks/useCollectFlow"
import { useTranslation } from "@/hooks/useTranslation"
import { PaperPlaneTilt, QrCode } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { WalletActivityFeed } from "@/components/dashboard/WalletActivityFeed"
import { useRouter } from "next/navigation"

type Props = {
  merchantWalletAddress: string
}

const quickActionClassName =
  "flex-1 cursor-pointer rounded-2xl border border-quick-action-border bg-quick-action-surface text-quick-action-foreground backdrop-blur-md transition-all hover:border-quick-action-hover-border hover:bg-quick-action-hover"

export function OwnerHome({ merchantWalletAddress }: Props) {
  const router = useRouter()
  const { t } = useTranslation()

  const {
    collectOpen,
    setCollectOpen,
    activeRequest,
    handleRequestChange,
    clearActiveRequest,
  } = useCollectFlow()

  return (
    <>
      <BalanceCard address={merchantWalletAddress} />

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
          onClick={() => router.push("/dashboard/send")}
          variant="ghost"
          className={quickActionClassName}
          size="lg"
        >
          <PaperPlaneTilt className="mr-2 h-4 w-4" />
          {t("transfer")}
        </Button>
      </div>

      <CollectModal
        open={collectOpen}
        onOpenChange={setCollectOpen}
        merchantWalletAddress={merchantWalletAddress}
        activeRequest={activeRequest}
        onRequestChange={handleRequestChange}
      />

      {activeRequest && (
        <ActivePaymentRequestCard
          request={activeRequest}
          onOpenQr={() => setCollectOpen(true)}
          onCancel={clearActiveRequest}
        />
      )}

      <WalletActivityFeed />
    </>
  )
}
