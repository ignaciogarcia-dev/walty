"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { useQueries } from "@tanstack/react-query"
import { ArrowUpRightIcon, ArrowSquareOutIcon, ArrowClockwiseIcon, MoneyIcon } from "@phosphor-icons/react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTranslation } from "@/hooks/useTranslation"
import type { PaymentRequestHistoryItem } from "@/lib/activity/types"
import { PAYMENT_CHAIN_ID } from "@/lib/payments/config"
import { getTxUrl } from "@/lib/explorer/getTxUrl"

type RefundExecutedRow = {
  id: string
  amountUsd: string
  tokenSymbol: string
  destinationAddress: string
  reason: string
  txHash: string | null
  createdAt: string
  reviewedAt: string | null
}

type Movement =
  | {
    kind: "collection"
    id: string
    sortAt: number
    amountUsd: string
    tokenSymbol: string
    txHash: string | null
    chainId: number
  }
  | {
    kind: "refund"
    id: string
    sortAt: number
    amountUsd: string
    tokenSymbol: string
    reason: string
    destinationAddress: string
    txHash: string | null
    chainId: number
  }

function truncateMiddle(s: string, start = 6, end = 4) {
  if (s.length <= start + end + 1) return s
  return `${s.slice(0, start)}…${s.slice(-end)}`
}

/** USD formatting matching activity/utils: no cents when the amount is a whole number (e.g. 10 or "10.00"). */
function formatMovementUsd(amountUsd: string): string {
  const num = parseFloat(amountUsd)
  if (!Number.isFinite(num)) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0)
  }
  const cents = Math.round(num * 100)
  const isWholeDollars = cents % 100 === 0
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: isWholeDollars ? 0 : 2,
    maximumFractionDigits: isWholeDollars ? 0 : 2,
  }).format(num)
}

function groupByDate(movements: Movement[], locale: string | undefined): { label: string; items: Movement[] }[] {
  const groups: Map<string, Movement[]> = new Map()
  const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }

  for (const m of movements) {
    const key = new Date(m.sortAt).toLocaleDateString(locale, dateFmt)
    const list = groups.get(key)
    if (list) list.push(m)
    else groups.set(key, [m])
  }

  return Array.from(groups, ([label, items]) => ({ label, items }))
}

/** Must match the row's `duration-*` class: the detail opens when the scale transition ends. */
const MOVEMENT_ROW_TRANSITION_MS = 100

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 ">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right break-all">{children}</span>
    </div>
  )
}

export function CashierMovementsFeed() {
  const { t, locale } = useTranslation()
  const [selected, setSelected] = useState<Movement | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const isMobile = useIsMobile()
  const openMovementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (openMovementTimeoutRef.current) clearTimeout(openMovementTimeoutRef.current)
    }
  }, [])

  function scheduleOpenMovement(m: Movement) {
    if (openMovementTimeoutRef.current) clearTimeout(openMovementTimeoutRef.current)
    openMovementTimeoutRef.current = setTimeout(() => {
      openMovementTimeoutRef.current = null
      setSelected(m)
      setDetailOpen(true)
    }, MOVEMENT_ROW_TRANSITION_MS)
  }

  const [paymentsQ, refundsQ] = useQueries({
    queries: [
      {
        queryKey: ["payment-requests-history", "paid", "cashier-feed"],
        queryFn: async () => {
          const res = await fetch("/api/payment-requests/history?status=paid&limit=50")
          if (!res.ok) throw new Error("Failed to fetch collections")
          const { data } = await res.json() as { data: { items: PaymentRequestHistoryItem[] } }
          return data.items ?? []
        },
        staleTime: 60_000,
      },
      {
        queryKey: ["refund-requests", "executed", "cashier-feed"],
        queryFn: async () => {
          const res = await fetch("/api/business/refund-requests?status=executed")
          if (!res.ok) throw new Error("Failed to fetch refunds")
          const { data } = await res.json() as { data: { refundRequests: RefundExecutedRow[] } }
          return data.refundRequests ?? []
        },
        staleTime: 60_000,
      },
    ],
  })

  const loading = paymentsQ.isLoading || refundsQ.isLoading
  const refetching = (paymentsQ.isFetching || refundsQ.isFetching) && !loading
  const error = paymentsQ.error ?? refundsQ.error

  function handleRefresh() {
    paymentsQ.refetch()
    refundsQ.refetch()
  }

  const movements = useMemo(() => {
    const payments = paymentsQ.data ?? []
    const refunds = refundsQ.data ?? []

    const out: Movement[] = []

    for (const p of payments) {
      const sortAt = Date.parse(p.paidAt ?? p.createdAt)
      out.push({
        kind: "collection",
        id: `c-${p.id}`,
        sortAt: Number.isFinite(sortAt) ? sortAt : 0,
        amountUsd: p.receivedAmountUsd ?? p.amountUsd,
        tokenSymbol: p.tokenSymbol,
        txHash: p.txHash,
        chainId: p.chainId,
      })
    }

    for (const r of refunds) {
      const sortAt = Date.parse(r.reviewedAt ?? r.createdAt)
      out.push({
        kind: "refund",
        id: `r-${r.id}`,
        sortAt: Number.isFinite(sortAt) ? sortAt : 0,
        amountUsd: r.amountUsd,
        tokenSymbol: r.tokenSymbol,
        reason: r.reason,
        destinationAddress: r.destinationAddress,
        txHash: r.txHash,
        chainId: PAYMENT_CHAIN_ID,
      })
    }

    out.sort((a, b) => b.sortAt - a.sortAt)
    return out
  }, [paymentsQ.data, refundsQ.data])

  const groups = useMemo(() => groupByDate(movements, locale), [movements, locale])

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
        <h2 className="text-sm font-semibold text-foreground">{t("cashier-movements-feed-title")}</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refetching || loading}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          aria-label="Refresh"
        >
          <ArrowClockwiseIcon className={`size-4 ${refetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && (
        <div className="flex flex-col gap-10 pt-10">
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

      {!loading && error && (
        <p className="text-sm text-destructive text-center py-6">{t("connection-error")}</p>
      )}

      {!loading && !error && movements.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">{t("cashier-movements-empty")}</p>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="flex flex-col">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-1">
                <span className="text-sm font-medium text-foreground">{group.label}</span>
              </div>

              <ul className="flex flex-col gap-4">
                {group.items.map((m) => {
                  const isIn = m.kind === "collection"
                  const label = isIn ? t("cashier-movement-collection") : t("cashier-movement-refund")
                  const subtitle = isIn
                    ? (m.txHash ? truncateMiddle(m.txHash, 8, 6) : "")
                    : m.kind === "refund"
                      ? truncateMiddle(m.destinationAddress)
                      : ""
                  const amount = `${formatMovementUsd(m.amountUsd)} ${m.tokenSymbol}`
                  const time = new Date(m.sortAt).toLocaleTimeString(locale, timeFmt)

                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 px-5 py-5 border rounded-3xl bg-card cursor-pointer transition-transform duration-100 ease-out focus:scale-[0.99] active:scale-[0.99] focus:outline-none"
                      onClick={() => scheduleOpenMovement(m)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          scheduleOpenMovement(m)
                        }
                      }}
                    >
                      {/* Icon avatar */}
                      <div
                        className={
                          isIn
                            ? "flex size-10 shrink-0 items-center justify-center rounded-full text-emerald-600 border border-emerald-200 dark:border-emerald-800"
                            : "flex size-10 shrink-0 items-center justify-center rounded-full text-rose-600 border border-rose-200 dark:border-rose-800"
                        }
                      >
                        {isIn ? <MoneyIcon className="size-5" weight="bold" /> : <ArrowUpRightIcon className="size-5" weight="bold" />}
                      </div>

                      {/* Title + subtitle */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-foreground">{label}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {subtitle}
                          {m.kind === "refund" && m.reason && ` · ${m.reason}`}
                        </span>
                      </div>

                      {/* Amount + time */}
                      <div className="flex shrink-0 flex-col items-end">
                        <span
                          className={
                            isIn
                              ? "text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                              : "text-sm font-semibold tabular-nums text-red-600 dark:text-red-400"
                          }
                        >
                          {isIn ? "+" : "−"}{amount}
                        </span>
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={new Date(m.sortAt).toISOString()}
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

      {/* Movement detail — Sheet (bottom) on mobile, Dialog (centered) on desktop */}
      {selected && (() => {
        const isIn = selected.kind === "collection"
        const label = isIn ? t("cashier-movement-collection") : t("cashier-movement-refund")
        const amount = `${formatMovementUsd(selected.amountUsd)} ${selected.tokenSymbol}`
        const fullDate = new Date(selected.sortAt).toLocaleString(locale, fullDateFmt)

        const iconNode = (
          <div
            className={
              isIn
                ? "flex size-12 items-center justify-center rounded-full text-emerald-600 border border-emerald-200 dark:border-emerald-800"
                : "flex size-12 items-center justify-center rounded-full text-rose-600 border border-rose-200 dark:border-rose-800"
            }
          >
            {isIn ? <MoneyIcon className="size-6" weight="bold" /> : <ArrowUpRightIcon className="size-6" weight="bold" />}
          </div>
        )

        const amountClass = isIn
          ? "text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
          : "text-2xl font-bold tabular-nums text-red-600 dark:text-red-400"

        const detailRows = (
          <>
            <DetailRow label={t("cashier-movement-detail-type")}>{label}</DetailRow>
            <DetailRow label={t("cashier-movement-detail-amount")}>{amount}</DetailRow>
            <DetailRow label={t("cashier-movement-detail-date")}>{fullDate}</DetailRow>

            {selected.kind === "refund" && (
              <>
                <DetailRow label={t("cashier-movement-detail-destination")}>
                  <span className="font-mono text-xs">{selected.destinationAddress}</span>
                </DetailRow>
                {selected.reason && (
                  <DetailRow label={t("cashier-movement-detail-reason")}>{selected.reason}</DetailRow>
                )}
              </>
            )}

            {selected.txHash && (
              <DetailRow label={t("cashier-movement-detail-tx")}>
                <a
                  href={getTxUrl(selected.txHash, selected.chainId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <span className="font-mono text-xs">{truncateMiddle(selected.txHash, 10, 8)}</span>
                  <ArrowSquareOutIcon className="size-3.5 shrink-0" />
                </a>
              </DetailRow>
            )}
          </>
        )

        const onClose = () => setSelected(null)

        if (isMobile) {
          const onCloseMobile = () => setDetailOpen(false)
          return (
            <AnimatePresence onExitComplete={() => setSelected(null)}>
              {detailOpen && <motion.div
                key="mobile-detail-backdrop"
                className="fixed inset-0 z-50 bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onCloseMobile}
              />}
              {detailOpen && <motion.div
                key="mobile-detail-panel"
                className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-background border-t pb-[env(safe-area-inset-bottom)]"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
              >
                {/* drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>

                <motion.div
                  className="flex flex-col items-center gap-3 px-4 pt-4 pb-2"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.3, ease: "easeOut" }}
                >
                  {iconNode}
                  <span className={amountClass}>{isIn ? "+" : "−"}{amount}</span>
                  <span className="text-sm text-muted-foreground">{label}</span>
                </motion.div>

                <motion.div
                  className="px-4 pb-6"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, duration: 0.3, ease: "easeOut" }}
                >
                  {detailRows}
                </motion.div>
              </motion.div>}
            </AnimatePresence>
          )
        }

        return (
          <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-w-md rounded-3xl sm:max-w-md 2xl:max-w-md">
              <DialogHeader className="items-center gap-3 pb-2">
                {iconNode}
                <DialogTitle className={amountClass}>
                  {isIn ? "+" : "−"}{amount}
                </DialogTitle>
                <DialogDescription>{label}</DialogDescription>
              </DialogHeader>
              <div className="px-2 pb-2">{detailRows}</div>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
