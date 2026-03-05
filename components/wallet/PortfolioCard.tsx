"use client"
import { usePortfolio } from "@/hooks/usePortfolio"
import { TokenList } from "./TokenList"
import { Spinner } from "@/components/ui/spinner"
import { useTranslation } from "@/hooks/useTranslation"

export function PortfolioCard({ address }: { address: string | null }) {
  const { t } = useTranslation()
  const { positions, totalUsd, loading, error } = usePortfolio(address)

  return (
    <div className="rounded-xl border bg-card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          {t("portfolio")}
        </p>
        {loading && <Spinner className="size-3" />}
      </div>

      <div>
        <p className="text-3xl font-bold text-foreground tabular-nums">
          ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{t("total-value")}</p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <TokenList positions={positions} />
    </div>
  )
}
