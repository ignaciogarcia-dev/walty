import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { hasPermission, Permission } from "@/lib/permissions"
import { TeamPanel } from "@/components/business/TeamPanel"

export default async function TeamPage() {
  const user = await requireAuth()
  const businessContext = await getBusinessContext(user.userId)
  const actor = { type: "user" as const, user }

  if (!hasPermission(actor, Permission.MEMBER_LIST, { businessContext })) {
    redirect("/dashboard/business/home")
  }

  return <TeamPanel />
}
