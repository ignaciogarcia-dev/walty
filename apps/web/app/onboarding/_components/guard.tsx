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
        // Redirect to dashboard after login — the lock screen handles unlock
        // for both mnemonic and MPC wallets. The recover page is not needed here.
        const next = encodeURIComponent("/dashboard")
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
      isOwner: user.isOwner,
      hasActiveBusiness: user.hasActiveBusiness,
      hasBusinessSettings: user.hasBusinessSettings,
      walletStatus: wallet.status,
    })

    // If onboarding is complete, don't allow staying in /onboarding/*.
    if (!nextStep) {
      // Navigate straight to the resolved dashboard route, not the "/dashboard"
      // segment root. The root only HTTP-redirects to /dashboard/home, and a
      // client-side router navigation that has to follow that redirect leaves the
      // intermediate RSC chunk "rejected" — which trips a React 19 dev-mode
      // performance.measure crash (negative timestamp) and hangs the transition.
      if (base.startsWith("/onboarding")) router.replace("/dashboard/home")
      return
    }

    const nextBase = nextStep.split("?")[0]

    // Allow sub-flows so we don't fight internal navigation.
    const allowedBases = new Set<string>()
    if (nextBase === "/onboarding/create-wallet") {
      ;[
        "/onboarding/create-wallet",
        "/onboarding/recovery-kit",
        "/onboarding/create-pin",
        "/onboarding/complete",
      ].forEach((p) => allowedBases.add(p))
    } else if (nextBase === "/onboarding/recover") {
      // MPC kit recovery re-issues a fresh kit and sets a new PIN before the
      // device share lands in IndexedDB, so walletStatus stays "recoverable"
      // across these sub-steps — allow them or the guard bounces back to recover.
      ;[
        "/onboarding/recover",
        "/onboarding/recovery-kit",
        "/onboarding/create-pin",
      ].forEach((p) => allowedBases.add(p))
    } else if (nextBase === "/onboarding/setup-business") {
      allowedBases.add("/onboarding/setup-business")
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
