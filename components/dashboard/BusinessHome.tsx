"use client"

import { useWalletContext } from "@/components/wallet/context"
import { OwnerHome } from "@/components/dashboard/OwnerHome"
import { CashierHome } from "@/components/dashboard/cashier/CashierHome"
import { Skeleton } from "@/components/ui/skeleton"
import { useBusinessContext } from "@/hooks/useBusinessContext"

/**
 * Business dashboard entry: routes to owner vs operator views.
 * Shared collect flow lives in useCollectFlow (used by both children).
 */
export function BusinessHome() {
  const { address } = useWalletContext()
  const businessCtx = useBusinessContext()

  if (businessCtx.loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="flex gap-3">
          <Skeleton className="h-12 flex-1 rounded-2xl" />
          <Skeleton className="h-12 flex-1 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (businessCtx.error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-destructive">
        {businessCtx.error}
      </div>
    )
  }

  const isOwner = businessCtx.isOwner ?? true
  const merchantWalletAddress =
    businessCtx.merchantWalletAddress ?? address ?? ""

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      {isOwner ? (
        <OwnerHome merchantWalletAddress={merchantWalletAddress} />
      ) : (
        <CashierHome
          merchantWalletAddress={merchantWalletAddress}
          role={businessCtx.role ?? "cashier"}
          businessName={businessCtx.businessName ?? ""}
        />
      )}
    </div>
  )
}
