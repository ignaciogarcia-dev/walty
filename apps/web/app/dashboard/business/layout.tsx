import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getBusinessContext } from "@walty/shared/business/getBusinessContext"
import { hasPermission, Permission } from "@walty/shared/permissions"

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  const businessContext = await getBusinessContext(user.userId)
  const actor = { type: "user" as const, user }

  if (!hasPermission(actor, Permission.BUSINESS_CONTEXT_READ, { businessContext })) {
    redirect("/onboarding")
  }

  return <>{children}</>
}
