import { redirect } from "next/navigation"
import { getUserFromToken } from "@/lib/auth/getUserFromToken"
import { PersonHome } from "@/components/dashboard/PersonHome"

export default async function HomePage() {
	const user = await getUserFromToken()
	if (!user) {
		redirect("/onboarding")
	}
	if (user.userType === "business") {
		redirect("/dashboard/business/home")
	}
	return <PersonHome />
}
