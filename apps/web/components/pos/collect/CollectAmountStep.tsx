"use client"

import { CheckCircle, Circle, Users } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useTranslation } from "@/hooks/useTranslation"
import { cn } from "@/utils/style"

interface CollectAmountStepProps {
  amount: string
  isSplitPayment: boolean
  error: string | null
  creating: boolean
  amountValid: boolean
  autoFocus: boolean
  onAmountChange: (value: string) => void
  onToggleSplit: () => void
  onSubmit: () => void
}

export function CollectAmountStep({
  amount,
  isSplitPayment,
  error,
  creating,
  amountValid,
  autoFocus,
  onAmountChange,
  onToggleSplit,
  onSubmit,
}: CollectAmountStepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-muted-foreground">{t("collect-amount-label")}</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            className="rounded-xl pl-7 text-lg"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && amountValid) onSubmit() }}
            autoFocus={autoFocus}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("currency-usd")}</p>
      </div>
      <button
        type="button"
        onClick={onToggleSplit}
        className={cn(
          "flex items-center gap-2 rounded-xl border p-3 text-left transition-colors",
          isSplitPayment ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        {isSplitPayment
          ? <CheckCircle size={20} weight="fill" className="shrink-0 text-primary" />
          : <Circle size={20} className="shrink-0 text-muted-foreground" />}
        <div className="flex items-center gap-2">
          <Users size={18} className={isSplitPayment ? "text-primary" : "text-muted-foreground"} />
          <span className={cn("text-sm font-medium", isSplitPayment ? "text-primary" : "text-foreground")}>
            {t("split-payment")}
          </span>
        </div>
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full rounded-xl" onClick={onSubmit} disabled={!amountValid || creating}>
        {creating ? <><Spinner className="mr-2" />{t("generating-qr")}</> : t("continue")}
      </Button>
    </div>
  )
}
