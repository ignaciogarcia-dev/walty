"use client"

import { Buildings } from "@phosphor-icons/react"
import type { BusinessRole } from "@/hooks/useBusinessContext"
import { useTranslation } from "@/hooks/useTranslation"

const ROLE_LABEL: Record<BusinessRole, string> = {
  owner: "Propietario",
  manager: "Gerente",
  cashier: "Cajero",
  waiter: "Mozo",
}

type Props = {
  role: BusinessRole
  businessName: string
}

export function BusinessContextBanner({ role, businessName }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
      <Buildings className="h-4 w-4 shrink-0" />
      <span>
        {t("operating-as")} <span className="font-medium text-foreground">{ROLE_LABEL[role]}</span>{" "}
        {t("at-business")} <span className="font-medium text-foreground">{businessName}</span>
      </span>
    </div>
  )
}
