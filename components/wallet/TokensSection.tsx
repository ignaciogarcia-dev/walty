"use client"
import type { TokenPosition } from "@/hooks/usePortfolio"
import { TokenRow } from "./TokenRow"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { useTranslation } from "@/hooks/useTranslation"

export function TokensSection({
    positions,
    loading
}: {
    positions: TokenPosition[]
    loading: boolean
}) {
    const { t } = useTranslation()

    // Filter tokens with balance > 0, or show popular tokens if none
    const tokensWithBalance = positions.filter((p) => parseFloat(p.balance) > 0)
    const tokensToShow = tokensWithBalance.length > 0
        ? tokensWithBalance
        : positions.filter((p) => {
            const popularSymbols = ["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"]
            return popularSymbols.includes(p.token.symbol)
        })

    if (loading) {
        return (
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-foreground shrink-0">
                        {t("tokens") || "Tokens"}
                    </h2>
                    <Separator className="flex-1" />
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-col divide-y divide-border">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="size-8 rounded-full" />
                                    <div className="flex flex-col gap-1.5">
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (tokensToShow.length === 0) {
        return (
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-foreground shrink-0">
                        {t("tokens") || "Tokens"}
                    </h2>
                    <Separator className="flex-1" />
                </div>
                <div className="rounded-xl border bg-card p-6">
                    <p className="text-sm text-muted-foreground text-center py-4">
                        {t("no-assets-found") || "No assets found"}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground shrink-0">
                    {t("tokens") || "Tokens"}
                </h2>
                <Separator className="flex-1" />
            </div>
            <div className="rounded-xl border bg-card p-4">
                <div className="flex flex-col divide-y divide-border">
                    {tokensToShow.map((position) => (
                        <TokenRow key={position.token.symbol} position={position} />
                    ))}
                </div>
            </div>
        </div>
    )
}
