import type { TokenPosition } from "@/hooks/usePortfolio"
import { TokenRow } from "./TokenRow"
import { useTranslation } from "@/hooks/useTranslation"

export function TokenList({ positions }: { positions: TokenPosition[] }) {
  const { t } = useTranslation()

  const nonZero = positions.filter((p) => parseFloat(p.balance) > 0)
  const zero = positions.filter((p) => parseFloat(p.balance) === 0)

  if (positions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {t("loading")}
      </p>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {nonZero.map((p) => (
        <TokenRow key={p.token.symbol} position={p} />
      ))}
      {zero.map((p) => (
        <TokenRow key={p.token.symbol} position={p} dim />
      ))}
    </div>
  )
}
