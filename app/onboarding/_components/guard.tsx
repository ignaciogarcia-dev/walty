"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"
import { useUser } from "@/hooks/useUser"
import { useWallet } from "@/hooks/useWallet"
import { getNextOnboardingStep } from "@/lib/onboarding/getNextStep"

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading: userLoading } = useUser()
  const wallet = useWallet()

  // When auth flips from "no session" -> "has session", the wallet status must be
  // recomputed (it depends on /api/addresses which returns 401 before login).
  useEffect(() => {
    if (userLoading) return
    if (!user) return
    wallet.refreshStatus().catch(() => {})
  }, [userLoading, user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (userLoading) return
    if (wallet.status === "loading") return

    const base = pathname.split("?")[0]

    // Unauthenticated users:
    // - If there is a local wallet, force login/register first.
    // - Otherwise, only allow the welcome/login/register entry routes.
    if (!user) {
      const hasLocalWallet = wallet.status === "locked"

      if (hasLocalWallet) {
        const next = encodeURIComponent("/onboarding/recover?reason=local-wallet")
        if (!base.startsWith("/onboarding/login")) {
          router.replace(`/onboarding/login?next=${next}`)
        }
        return
      }

      const allowed = new Set([
        "/onboarding/welcome",
        "/onboarding/login",
        "/onboarding/register",
        "/onboarding",
      ])
      if (!allowed.has(base)) {
        router.replace("/onboarding/welcome")
      }
      return
    }

    // Authenticated users should never sit in welcome/login/register.
    // Next step is fully determined by server user state + walletStatus.
    const nextStep = getNextOnboardingStep({
      hasActiveBusiness: user.hasActiveBusiness,
      userType: user.userType,
      walletStatus: wallet.status,
      hasProfile: user.hasProfile,
    })

    // If onboarding is complete, don't allow staying in /onboarding/*.
    if (!nextStep) {
      if (base.startsWith("/onboarding")) router.replace("/dashboard")
      return
    }

    const nextBase = nextStep.split("?")[0]

    // Allow sub-flows so we don't fight internal navigation.
    const allowedBases = new Set<string>()
    if (nextBase === "/onboarding/create-wallet") {
      ;[
        "/onboarding/create-wallet",
        "/onboarding/recovery-phrase",
        "/onboarding/confirm-recovery",
        "/onboarding/create-pin",
        "/onboarding/complete",
      ].forEach((p) => allowedBases.add(p))
    } else if (nextBase === "/onboarding/recover") {
      allowedBases.add("/onboarding/recover")
    } else if (nextBase === "/onboarding/account-type") {
      allowedBases.add("/onboarding/account-type")
    } else if (nextBase === "/onboarding/username") {
      allowedBases.add("/onboarding/username")
    } else {
      allowedBases.add(nextBase)
    }

    if (allowedBases.has(base)) return

    // If the next step is recover, force the correct reason query.
    if (nextBase === "/onboarding/recover") {
      const desired =
        wallet.status === "invalid-local"
          ? "/onboarding/recover?reason=invalid-local"
          : "/onboarding/recover?reason="
      router.replace(desired)
      return
    }

    router.replace(nextStep)
  }, [pathname, router, user, userLoading, wallet.status])

  const shouldBlockRender = userLoading || wallet.status === "loading"
  if (shouldBlockRender) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="fixed inset-0 z-[9999] bg-[#22c55e] flex flex-col items-center justify-center gap-4"
        >
          <h1 className="text-white text-4xl font-bold">WALTY</h1>
          <Spinner className="size-6 text-white" />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
