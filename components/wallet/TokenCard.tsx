import type { TokenPosition } from "@/hooks/usePortfolio"
import { TokenAvatar } from "./TokenAvatar"
import { getNetwork } from "@/lib/networks/networks"
import { Badge } from "@/components/ui/badge"

function formatBalance(balance: string): string {
  const num = parseFloat(balance)
  if (num === 0) return "0"
  if (num < 0.000001) return "<0.000001"
  if (num < 0.001) return num.toFixed(6)
  if (num < 1) return num.toFixed(4)
  if (num < 10000) return num.toFixed(4)
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

export function TokenCard({ position }: { position: TokenPosition }) {
  const { token, balance, valueUsd, imageUrl, chainId } = position
  const network = (() => {
    try { return getNetwork(chainId) } catch { return null }
  })()

  return (
    <div className="rounded-2xl border bg-card p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <TokenAvatar symbol={token.symbol} imageUrl={imageUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium leading-none truncate">{token.symbol}</p>
            {network && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 leading-tight">
                {network.name}
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{token.name}</p>
        </div>
      </div>

      <div className="flex flex-col items-end shrink-0">
        <p className="text-sm font-semibold text-foreground tabular-nums">
          {formatBalance(balance)} {token.symbol}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          ${valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  )
}
