"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useWalletContext } from "@/components/wallet/context"
import { useUnlockFlow } from "@/hooks/useUnlockFlow"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { getTokensByChain } from "@/lib/tokens/tokenRegistry"
import { PAYMENT_CHAIN_ID } from "@/lib/payments/config"
import { getTxUrl } from "@/lib/explorer/getTxUrl"
import { useTranslation } from "@/hooks/useTranslation"
import { cn } from "@/utils/style"

type OperatorWallet = {
  memberId: number
  displayName: string
  walletAddress: string
  derivationIndex: number
  status: "invited" | "active" | "suspended" | "revoked"
  balances: {
    USDC: string
    USDT: string
  }
}

const COLLECT_TOKENS = ["USDC", "USDT"] as const
type CollectToken = typeof COLLECT_TOKENS[number]

export default function OperatorWalletsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { collectOperatorFunds, collectStatus, collectTxHash, collectError, resetCollect } =
    useWalletContext()
  const { ensureUnlocked, unlockDialog } = useUnlockFlow()

  const [collecting, setCollecting] = useState<{ memberId: number; token: CollectToken } | null>(null)

  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ["operator-wallets"],
    queryFn: async () => {
      const res = await fetch("/api/business/operator-wallets")
      if (!res.ok) throw new Error("Failed to load operator wallets")
      const { data } = await res.json()
      return data.wallets as OperatorWallet[]
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  async function handleCollect(wallet: OperatorWallet, symbol: CollectToken) {
    const unlocked = await ensureUnlocked()
    if (!unlocked) return

    const tokens = getTokensByChain(PAYMENT_CHAIN_ID)
    const token = tokens.find((t) => t.symbol === symbol)
    if (!token) return

    resetCollect()
    setCollecting({ memberId: wallet.memberId, token: symbol })

    await collectOperatorFunds({
      derivationIndex: wallet.derivationIndex,
      operatorAddress: wallet.walletAddress,
      token,
    })

    queryClient.invalidateQueries({ queryKey: ["operator-wallets"] })
    setCollecting(null)
  }

  const activeWallets = wallets.filter((w) => w.status === "active")
  const inactiveWallets = wallets.filter((w) => w.status !== "active")

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 flex items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t("cashier-wallets")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("cashier-wallets-desc")}
        </p>
      </div>

      {wallets.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("cashier-wallets-empty")}
        </div>
      )}

      {activeWallets.length > 0 && (
        <div className="flex flex-col gap-3">
          {activeWallets.map((wallet) => (
            <WalletCard
              key={wallet.memberId}
              wallet={wallet}
              collecting={collecting}
              collectStatus={collectStatus}
              collectTxHash={collectTxHash}
              collectError={collectError}
              onCollect={handleCollect}
            />
          ))}
        </div>
      )}

      {inactiveWallets.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-muted-foreground mt-2">{t("cashier-inactive")}</h2>
          <div className="flex flex-col gap-3">
            {inactiveWallets.map((wallet) => (
              <WalletCard
                key={wallet.memberId}
                wallet={wallet}
                collecting={collecting}
                collectStatus={collectStatus}
                collectTxHash={collectTxHash}
                collectError={collectError}
                onCollect={handleCollect}
              />
            ))}
          </div>
        </>
      )}

      {unlockDialog}
    </div>
  )
}

function WalletCard({
  wallet,
  collecting,
  collectStatus,
  collectTxHash,
  collectError,
  onCollect,
}: {
  wallet: OperatorWallet
  collecting: { memberId: number; token: CollectToken } | null
  collectStatus: string
  collectTxHash: string | null
  collectError: string | null
  onCollect: (wallet: OperatorWallet, token: CollectToken) => void
}) {
  const { t } = useTranslation()
  const isThisWalletCollecting = collecting?.memberId === wallet.memberId
  const isInactive = wallet.status !== "active"
  const inactiveStatusLabel =
    wallet.status === "suspended"
      ? t("member-status-suspended")
      : wallet.status === "revoked"
        ? t("member-status-revoked")
        : t("member-status-invited")

  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card p-5 flex flex-col gap-4",
      isInactive && "opacity-60",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{wallet.displayName}</p>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            {wallet.walletAddress.slice(0, 6)}…{wallet.walletAddress.slice(-4)}
          </p>
        </div>
        {isInactive && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground shrink-0">
            {inactiveStatusLabel}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {COLLECT_TOKENS.map((symbol) => {
          const balance = wallet.balances[symbol]
          const hasBalance = parseFloat(balance) > 0
          const isCollectingThis =
            isThisWalletCollecting && collecting?.token === symbol

          return (
            <div
              key={symbol}
              className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3"
            >
              <div>
                <p className="text-xs text-muted-foreground">{symbol}</p>
                <p className={cn(
                  "text-sm font-semibold font-mono",
                  hasBalance ? "text-foreground" : "text-muted-foreground",
                )}>
                  {hasBalance ? `$${parseFloat(balance).toFixed(2)}` : "—"}
                </p>
              </div>

              {!isInactive && (
                hasBalance ? (
                  <Button
                    size="sm"
                    onClick={() => onCollect(wallet, symbol)}
                    disabled={!!collecting}
                    className="rounded-xl"
                  >
                    {isCollectingThis ? (
                      <>
                        <Spinner className="mr-2 size-3" />
                        {collectStatus === "funding-gas"
                          ? t("cashier-sending-gas")
                          : t("cashier-collecting")}
                      </>
                    ) : (
                      `${t("collect")} ${symbol}`
                    )}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("cashier-no-funds")}</span>
                )
              )}
            </div>
          )
        })}
      </div>

      {isThisWalletCollecting && collectStatus === "error" && collectError && (
        <p className="text-xs text-destructive">{collectError}</p>
      )}

      {isThisWalletCollecting && collectStatus === "confirmed" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-xs text-green-600">{t("cashier-funds-collected")}</p>
          {collectTxHash && (
            <a
              href={getTxUrl(collectTxHash, PAYMENT_CHAIN_ID)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline hover:text-foreground font-mono"
            >
              {collectTxHash.slice(0, 8)}…{collectTxHash.slice(-6)}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
