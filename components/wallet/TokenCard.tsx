import type { TokenPosition } from "@/hooks/usePortfolio"

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
  const { token, balance, valueUsd } = position

  return (
    <div className="rounded-xl border bg-card p-6 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
          {token.symbol.slice(0, 2)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium leading-none">{token.symbol}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{token.name}</p>
        </div>
      </div>

      <div className="mt-2">
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {formatBalance(balance)} {token.symbol}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          ${valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  )
}
