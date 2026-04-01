import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { PersonHome } from "@/components/dashboard/PersonHome"

export default async function HomePage() {
  const user = await requireAuth()
  const businessContext = await getBusinessContext(user.userId)

  // Owner or operator has a business context → show business home
  if (businessContext) redirect("/dashboard/business/home")

  return <PersonHome />
}
