import { redirect } from "next/navigation"
import { getUserFromToken } from "@/lib/auth/getUserFromToken"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { TeamPanel } from "@/components/business/TeamPanel"

export default async function TeamPage() {
  const user = await getUserFromToken()
  if (!user) {
    redirect("/onboarding")
  }

  const ctx = await getBusinessContext(user.userId)
  if (!ctx?.isOwner) {
    redirect("/dashboard/business/home")
  }

  return <TeamPanel />
}
