"use client"
import { Button } from "@/components/ui/button"

export default function AccessSuspendedPage() {
  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (error) {
      console.error("Logout error:", error)
    }
    window.location.assign("/onboarding/login")
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Your access is suspended</h1>
        <p className="text-sm text-muted-foreground">Contact your administrator.</p>
        <Button onClick={handleLogout} className="w-full rounded-xl">
          Logout
        </Button>
      </div>
    </div>
  )
}
