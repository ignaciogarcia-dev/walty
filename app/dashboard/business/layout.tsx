import { redirect } from "next/navigation"
import { getUserFromToken } from "@/lib/auth/getUserFromToken"

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromToken()
  if (user?.userType !== "business") {
    redirect("/dashboard/home")
  }
  return <>{children}</>
}
