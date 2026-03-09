"use client"
import type { TxRecord } from "@/hooks/useWallet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ExplorerLink } from "./ExplorerLink"
import { useTranslation } from "@/hooks/useTranslation"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowDown, ArrowUp } from "@phosphor-icons/react"

function shortenAddress(address: string) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatDate(dateString: string | null): string {
    if (!dateString) return ""
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function RecentTransactions({
    txHistory,
    loading,
    limit = 5,
    walletAddress
}: {
    txHistory: TxRecord[]
    loading?: boolean
    limit?: number
    walletAddress?: string | null
}) {
    const { t } = useTranslation()

    // Sort by date descending and limit
    const sortedTxs = (txHistory || [])
        .sort((a, b) => {
            if (!a.createdAt && !b.createdAt) return 0
            if (!a.createdAt) return 1
            if (!b.createdAt) return -1
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        .slice(0, limit)

    if (loading) {
        return (
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-foreground shrink-0">
                        {t("recent-activity") || "Recent Activity"}
                    </h2>
                    <Separator className="flex-1" />
                </div>
                <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-5 w-20" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                            <Skeleton className="h-3 w-32" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground shrink-0">
                    {t("recent-activity") || "Recent Activity"}
                </h2>
                <Separator className="flex-1" />
            </div>

            {sortedTxs.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("no-transactions-yet")}</p>
            ) : (
                <div className="flex flex-col gap-2">
                    {sortedTxs.map((tx) => {
                        // Determine if it's a send or receive based on wallet address
                        const isSend = walletAddress
                            ? tx.fromAddress.toLowerCase() === walletAddress.toLowerCase()
                            : true // Default to send if no wallet address provided

                        return (
                            <button
                                key={tx.id}
                                className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5 hover:bg-accent transition-colors text-left"
                                onClick={() => window.open(`https://etherscan.io/tx/${tx.hash}`, "_blank")}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {isSend ? (
                                            <ArrowUp className="size-3.5 text-muted-foreground" />
                                        ) : (
                                            <ArrowDown className="size-3.5 text-muted-foreground" />
                                        )}
                                        <Badge
                                            variant={
                                                tx.status === "confirmed" ? "default" :
                                                    tx.status === "failed" ? "destructive" : "secondary"
                                            }
                                            className="text-xs"
                                        >
                                            {tx.status === "confirmed" ? t("confirmed") : tx.status === "failed" ? t("failed") : t("pending")}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="font-mono text-sm font-semibold">
                                            {tx.value} {tx.tokenSymbol}
                                        </span>
                                        {tx.createdAt && (
                                            <span className="text-[10px] text-muted-foreground">
                                                {formatDate(tx.createdAt)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <p className="font-mono text-xs text-muted-foreground">
                                    {isSend ? "→" : "←"} {shortenAddress(tx.toAddress)}
                                </p>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
