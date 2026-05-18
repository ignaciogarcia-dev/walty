"use client"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AccessRevokedPage() {

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
        <h1 className="text-lg font-semibold text-foreground">Your access has been revoked</h1>
        <p className="text-sm text-muted-foreground">
          If you have a new invitation, use the link sent to you to join again.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={handleLogout} className="w-full rounded-xl">
            Logout
          </Button>
          <Link href="/onboarding/login" className="text-sm text-muted-foreground underline hover:text-foreground">
            Log in and use your new invitation link
          </Link>
        </div>
      </div>
    </div>
  )
}
