import type { TokenPosition } from "@/hooks/usePortfolio"
import { TokenAvatar } from "./TokenAvatar"

function formatBalance(balance: string): string {
  const num = parseFloat(balance)
  if (num === 0) return "0"
  if (num < 0.000001) return "<0.000001"
  if (num < 0.001) return num.toFixed(6)
  if (num < 1) return num.toFixed(4)
  if (num < 10000) return num.toFixed(4)
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

export function TokenRow({
  position,
  dim,
}: {
  position: TokenPosition
  dim?: boolean
}) {
  const { token, balance, valueUsd, imageUrl } = position

  return (
    <div
      className={`flex items-center justify-between py-3 transition-opacity ${dim ? "opacity-35" : ""}`}
    >
      <div className="flex items-center gap-3">
        <TokenAvatar symbol={token.symbol} imageUrl={imageUrl} />
        <div>
          <p className="text-sm font-medium leading-none">{token.symbol}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{token.name}</p>
        </div>
      </div>

      <div className="text-right">
        <p className="text-sm font-mono">
          {formatBalance(balance)} {token.symbol}
        </p>
        <p className="text-xs text-muted-foreground">
          ${valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  )
}
