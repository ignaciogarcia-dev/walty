"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  XCircle,
  ArrowClockwise,
  ArrowSquareOut,
  MoneyIcon,
} from "@phosphor-icons/react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTranslation } from "@/hooks/useTranslation"
import type { TransactionActivityItem } from "@/lib/activity/types"
import {
  formatActivityUsd,
  groupActivityByDate,
  truncateMiddle,
} from "@/lib/activity/utils"
import { getNetwork } from "@/lib/networks/networks"
import { getTxUrl } from "@/lib/explorer/getTxUrl"

// Poll interval: backend reconciler runs every 30s, match it
const ACTIVITY_REFETCH_INTERVAL_MS = 30_000

type ItemWithSort = TransactionActivityItem & { sortAt: number }

/** Must match the row's `duration-*` class. */
const ROW_TRANSITION_MS = 100

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right break-all">{children}</span>
    </div>
  )
}

export function WalletActivityFeed() {
  const { t, locale } = useTranslation()
  const [selected, setSelected] = useState<ItemWithSort | null>(null)
  const isMobile = useIsMobile()
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current)
    }
  }, [])

  function scheduleOpen(item: ItemWithSort) {
    if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current)
    openTimeoutRef.current = setTimeout(() => {
      openTimeoutRef.current = null
      setSelected(item)
    }, ROW_TRANSITION_MS)
  }

  const { data: rawItems = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["tx-activity-home"],
    queryFn: async () => {
      const res = await fetch("/api/tx/activity?type=all&limit=10")
      if (!res.ok) throw new Error("Failed to fetch activity")
      const { data } = await res.json()
      return (data.items ?? []) as TransactionActivityItem[]
    },
    staleTime: 60_000,
    refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
  })

  const items: ItemWithSort[] = useMemo(
    () =>
      rawItems
        .map((item) => ({ ...item, sortAt: Date.parse(item.createdAt) }))
        .filter((i) => Number.isFinite(i.sortAt))
        .sort((a, b) => b.sortAt - a.sortAt),
    [rawItems],
  )

  const groups = useMemo(() => groupActivityByDate(items, locale), [items, locale])
  const refetching = isFetching && !isLoading

  const timeFmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }
  const fullDateFmt: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t("recent-activity")}</h2>
        <button
          type="button"
          onClick={() => { refetch() }}
          disabled={refetching || isLoading}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          aria-label="Refresh"
        >
          <ArrowClockwise className={`size-4 ${refetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-10 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">{t("no-transactions")}</p>
      )}

      {!isLoading && groups.length > 0 && (
        <div className="flex flex-col">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-1">
                <span className="text-sm font-medium text-foreground">{group.label}</span>
              </div>

              <ul className="flex flex-col gap-4">
                {group.items.map((item) => {
                  const isReceive = item.type === "receive" || item.type === "refund" || item.type === "collected"
                  const failed = item.status === "failed"
                  const pending = item.status === "pending"

                  const network = (() => {
                    try { return getNetwork(item.chainId) } catch { return null }
                  })()

                  const counterparty = isReceive ? item.fromAddress : item.toAddress
                  const subtitle = `${truncateMiddle(counterparty)}${network ? ` · ${network.name}` : ""}`
                  const amount = `${formatActivityUsd(item.value)} ${item.tokenSymbol}`
                  const time = new Date(item.sortAt).toLocaleTimeString(locale, timeFmt)

                  const iconClass = failed
                    ? "flex size-10 shrink-0 items-center justify-center rounded-full text-destructive border border-destructive/30"
                    : pending
                      ? "flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground border border-border"
                      : isReceive
                        ? "flex size-10 shrink-0 items-center justify-center rounded-full text-green-600 border border-green-200 dark:border-green-800"
                        : "flex size-10 shrink-0 items-center justify-center rounded-full text-rose-600 border border-rose-200 dark:border-rose-800"

                  const amountClass = failed
                    ? "text-sm font-semibold tabular-nums text-destructive"
                    : pending
                      ? "text-sm font-semibold tabular-nums text-muted-foreground"
                      : isReceive
                        ? "text-sm font-semibold tabular-nums text-green-600 dark:text-green-400"
                        : "text-sm font-semibold tabular-nums text-red-600 dark:text-red-400"

                  const typeLabel = item.type === "collected"
                    ? t("wallet-activity-collected")
                    : isReceive
                      ? t("wallet-activity-receive")
                      : item.type === "payment"
                        ? t("wallet-activity-payment")
                        : t("wallet-activity-send")

                  const amountPrefix = failed || pending
                    ? ""
                    : isReceive
                      ? "+"
                      : "−"

                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-5 py-5 border rounded-3xl bg-card cursor-pointer transition-transform duration-100 ease-out focus:scale-[0.99] active:scale-[0.99] focus:outline-none"
                      onClick={() => scheduleOpen(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          scheduleOpen(item)
                        }
                      }}
                    >
                      <div className={iconClass}>
                        {failed
                          ? <XCircle className="size-5" weight="bold" />
                          : item.type === "collected"
                            ? <MoneyIcon className="size-5" weight="bold" />
                            : isReceive
                              ? <ArrowDownRightIcon className="size-5" weight="bold" />
                              : <ArrowUpRightIcon className="size-5" weight="bold" />
                        }
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {typeLabel}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                      </div>

                      <div className="flex shrink-0 flex-col items-end">
                        <span className={amountClass}>
                          {amountPrefix}{amount}
                        </span>
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={new Date(item.sortAt).toISOString()}
                        >
                          {time}
                        </time>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Movement detail — Sheet on mobile, Dialog on desktop */}
      {selected && (() => {
        const isReceive = selected.type === "receive" || selected.type === "refund" || selected.type === "collected"
        const failed = selected.status === "failed"
        const pending = selected.status === "pending"
        const amount = `${formatActivityUsd(selected.value)} ${selected.tokenSymbol}`
        const fullDate = new Date(selected.sortAt).toLocaleString(locale, fullDateFmt)
        const network = (() => {
          try { return getNetwork(selected.chainId) } catch { return null }
        })()
        const statusLabel = failed ? t("failed") : pending ? t("pending") : t("confirmed")
        const typeLabel = selected.type === "collected"
          ? t("wallet-activity-collected")
          : isReceive
            ? t("wallet-activity-receive")
            : selected.type === "payment"
              ? t("wallet-activity-payment")
              : t("wallet-activity-send")
        const amountPrefix = failed || pending ? "" : isReceive ? "+" : "−"

        const amountClass = failed
          ? "text-2xl font-bold tabular-nums text-destructive"
          : pending
            ? "text-2xl font-bold tabular-nums text-muted-foreground"
            : isReceive
              ? "text-2xl font-bold tabular-nums text-green-600 dark:text-green-400"
              : "text-2xl font-bold tabular-nums text-red-600 dark:text-red-400"

        const iconClass = failed
          ? "flex size-12 items-center justify-center rounded-full text-destructive border border-destructive/30"
          : pending
            ? "flex size-12 items-center justify-center rounded-full text-muted-foreground border border-border"
            : isReceive
              ? "flex size-12 items-center justify-center rounded-full text-green-600 border border-green-200 dark:border-green-800"
              : "flex size-12 items-center justify-center rounded-full text-rose-600 border border-rose-200 dark:border-rose-800"

        const iconNode = (
          <div className={iconClass}>
            {failed
              ? <XCircle className="size-6" weight="bold" />
              : selected.type === "collected"
                ? <MoneyIcon className="size-6" weight="bold" />
                : isReceive
                  ? <ArrowDownRightIcon className="size-6" weight="bold" />
                  : <ArrowUpRightIcon className="size-6" weight="bold" />
            }
          </div>
        )

        const counterpartyLabel = isReceive ? t("wallet-activity-from") : t("wallet-activity-to")
        const counterpartyAddress = isReceive ? selected.fromAddress : selected.toAddress

        const detailRows = (
          <>
            <DetailRow label={t("cashier-movement-detail-type")}>{typeLabel}</DetailRow>
            <DetailRow label={t("cashier-movement-detail-amount")}>{`${amountPrefix}${amount}`}</DetailRow>
            <DetailRow label={t("cashier-movement-detail-date")}>{fullDate}</DetailRow>
            <DetailRow label={counterpartyLabel}>
              <span className="font-mono text-xs">{counterpartyAddress}</span>
            </DetailRow>
            {network && (
              <DetailRow label={t("wallet-activity-network")}>{network.name}</DetailRow>
            )}
            <DetailRow label={t("wallet-activity-status")}>{statusLabel}</DetailRow>
            <DetailRow label={t("cashier-movement-detail-tx")}>
              <a
                href={getTxUrl(selected.hash, selected.chainId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <span className="font-mono text-xs">{truncateMiddle(selected.hash, 10, 8)}</span>
                <ArrowSquareOut className="size-3.5 shrink-0" />
              </a>
            </DetailRow>
          </>
        )

        const onClose = () => setSelected(null)

        if (isMobile) {
          return (
            <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader className="items-center gap-3 pb-2">
                  {iconNode}
                  <SheetTitle className={amountClass}>
                    {`${amountPrefix}${amount}`}
                  </SheetTitle>
                  <SheetDescription>{typeLabel}</SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-6">{detailRows}</div>
              </SheetContent>
            </Sheet>
          )
        }

        return (
          <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-w-md rounded-3xl sm:max-w-md 2xl:max-w-md">
              <DialogHeader className="items-center gap-3 pb-2">
                {iconNode}
                <DialogTitle className={amountClass}>
                  {`${amountPrefix}${amount}`}
                </DialogTitle>
                <DialogDescription>{typeLabel}</DialogDescription>
              </DialogHeader>
              <div className="px-2 pb-2">{detailRows}</div>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
