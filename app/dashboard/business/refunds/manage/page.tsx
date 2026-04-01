import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { hasPermission, Permission } from "@/lib/permissions"
import { RefundManagePage } from "@/components/business/RefundManagePage"

export default async function ManageRefundsPage() {
  const user = await requireAuth()
  const businessContext = await getBusinessContext(user.userId)
  const actor = { type: "user" as const, user }

  if (!hasPermission(actor, Permission.REFUND_REVIEW, { businessContext })) {
    redirect("/dashboard/business/home")
  }

  return <RefundManagePage />
}
