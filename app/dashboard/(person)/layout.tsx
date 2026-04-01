import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { canAccessPersonRoutes } from "@/lib/policies/wallet.policy"

export default async function PersonLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()

  // No userType means onboarding is still in progress — allow access.
  if (!user.userType) return <>{children}</>

  const businessContext = await getBusinessContext(user.userId)
  const actor = { type: "user" as const, user }
  const policy = canAccessPersonRoutes(actor, { businessContext })

  if (!policy.allowed) redirect("/dashboard/home")

  return <>{children}</>
}
