import { redirect } from "next/navigation"
import { getUserFromToken } from "@/lib/auth/getUserFromToken"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { PersonHome } from "@/components/dashboard/PersonHome"

export default async function HomePage() {
  const user = await getUserFromToken()
  if (!user) {
    redirect("/onboarding")
  }
  if (user.userType === "business") {
    redirect("/dashboard/business/home")
  }
  // Check if person user is an active business operator
  const ctx = await getBusinessContext(user.userId)
  if (ctx) {
    redirect("/dashboard/business/home")
  }
  return <PersonHome />
}
