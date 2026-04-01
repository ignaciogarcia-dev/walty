"use client"
import { useEffect, useLayoutEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useWallet } from "@/hooks/useWallet"
import { LockScreen } from "@/components/wallet/LockScreen"
import { WalletContext } from "@/components/wallet/context"
import { Toaster } from "@/components/ui/toaster"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { useUser } from "@/hooks/useUser"
import { getDashboardRoute } from "@/lib/dashboard/get-dashboard-route"
import { ONBOARDING_LEGACY_STORAGE_KEY } from "@/app/onboarding/context"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
	return <DashboardLayoutInner>{children}</DashboardLayoutInner>
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const { user, loading: userLoading } = useUser()
	const wallet = useWallet()
	const { status, unlock } = wallet

	// Single orchestrator: determines the next required onboarding step based on
	// user state (hasActiveBusiness, userType) and wallet state. Returns null when done.
	const pathname = usePathname()

	// Hygiene: strip legacy onboarding entries from tab storage if present.
	useLayoutEffect(() => {
		try {
			sessionStorage.removeItem(ONBOARDING_LEGACY_STORAGE_KEY)
			sessionStorage.removeItem("onboarding_mnemonic")
			sessionStorage.removeItem("onboarding_address")
		} catch {
			/* noop */
		}
	}, [])


	// Deterministic routing using pure decision function
	const route = getDashboardRoute({
		user: {
			hasProfile: user?.hasProfile ?? false,
			hasActiveBusiness: user?.hasActiveBusiness ?? false,
			businessStatus: user?.businessStatus ?? null,
			userType: user?.userType ?? null,
		},
		walletStatus: status,
		pathname,
	})

	useEffect(() => {
		if (userLoading) return

		// Skip if already on access pages
		if (pathname.startsWith("/dashboard/access-revoked") || pathname.startsWith("/dashboard/access-suspended")) {
			return
		}

		// Execute the routing decision
		switch (route.type) {
			case "onboarding":
				router.replace(route.step)
				return
			case "access-revoked":
				router.replace("/dashboard/access-revoked")
				return
			case "access-suspended":
				router.replace("/dashboard/access-suspended")
				return
			case "operator-redirect":
				router.replace("/dashboard/business/home")
				return
			case "allow":
				// Check for a pending pay redirect cookie after onboarding completes
				const match = document.cookie.match(/(?:^|;\s*)walty_pay_redirect=([^;]+)/)
				if (match) {
					const target = decodeURIComponent(match[1])
					document.cookie = "walty_pay_redirect=;path=/;max-age=0;SameSite=Strict"
					if (target.startsWith("/dashboard/pay/") && pathname !== target) {
						router.replace(target)
						return
					}
				}
				return
		}
	}, [route, userLoading, pathname, router])

	// Show spinner while loading user/wallet data or while redirecting
	if (status === "loading" || userLoading || route.type !== "allow") {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="fixed inset-0 z-[9999] bg-[#22c55e] text-white flex flex-col items-center justify-center gap-4">
					<h1 className="text-white text-4xl font-bold">WALTY</h1>
					<Spinner className="size-6" />
				</div>
			</div>
		)
	}

	// Locked wallet — skip for revoked/suspended; operators (hasActiveBusiness, non-owner) skip — owners still unlock their wallet
	if (
		status === "locked" &&
		!(user?.hasActiveBusiness && user?.userType !== "business") &&
		user?.businessStatus !== "revoked" &&
		user?.businessStatus !== "suspended"
	) {
		return <LockScreen onUnlock={unlock} />
	}

	// status === "unlocked" (wallet users and business owners), or locked operator (no personal wallet to unlock)
	return (
		<WalletContext.Provider value={wallet}>
			<Toaster />
			<SidebarProvider className="bg-dashboard-shell">
				<DashboardSidebar />
				<SidebarInset className="bg-dashboard-shell">
					<div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-dashboard-shell/95 px-4 backdrop-blur md:hidden">
						<SidebarTrigger className="size-9 rounded-xl border bg-background shadow-xs hover:bg-accent" />
						<span className="text-sm font-semibold text-foreground">WALTY</span>
					</div>
					<div className="flex-1 overflow-auto">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</WalletContext.Provider>
	)
}
