import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { hasPermission, Permission } from "@/lib/permissions"

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  const businessContext = await getBusinessContext(user.userId)
  const actor = { type: "user" as const, user }

  if (!hasPermission(actor, Permission.BUSINESS_CONTEXT_READ, { businessContext })) {
    redirect("/dashboard/home")
  }

  return <>{children}</>
}
