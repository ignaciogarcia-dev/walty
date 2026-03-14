import { redirect } from "next/navigation"
import { getUserFromToken } from "@/lib/auth/getUserFromToken"
import { getBusinessContext } from "@/lib/business/getBusinessContext"

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromToken()
  if (!user) {
    redirect("/onboarding")
  }

  // Allow both business owners and active operators
  const ctx = await getBusinessContext(user.userId)
  if (!ctx) {
    redirect("/dashboard/home")
  }

  return <>{children}</>
}
