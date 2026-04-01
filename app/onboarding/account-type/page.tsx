"use client"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { User, Storefront } from "@phosphor-icons/react"
import { cn } from "@/utils/style"
import { SESSION_QUERY_KEY, useUser } from "@/hooks/useUser"
import { useWallet } from "@/hooks/useWallet"
import { getNextOnboardingStep } from "@/lib/onboarding/getNextStep"
import { useTranslation } from "@/hooks/useTranslation"

type UserType = "person" | "business"

export default function AccountTypePage() {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { user, loading: userLoading } = useUser()
  const { status: walletStatus } = useWallet()
  const { t } = useTranslation()
  const [selected, setSelected] = useState<UserType>("person")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Avoid fighting with the submit navigation.
    if (loading) return
    if (userLoading) return
    if (!user) return
    if (walletStatus === "loading") return

    // If business access is revoked/suspended, we must not allow onboarding pages.
    if (user.businessStatus === "revoked" && !pathname?.startsWith("/dashboard/access-revoked")) {
      router.replace("/dashboard/access-revoked")
      return
    }
    if (user.businessStatus === "suspended" && !pathname?.startsWith("/dashboard/access-suspended")) {
      router.replace("/dashboard/access-suspended")
      return
    }

    const nextStep = getNextOnboardingStep({
      hasActiveBusiness: user.hasActiveBusiness,
      userType: user.userType,
      walletStatus,
      hasProfile: user.hasProfile,
    })

    // When null means onboarding is complete -> go to dashboard.
    const target = nextStep ?? "/dashboard"
    const targetBase = target.split("?")[0]

    if (pathname !== targetBase) {
      router.replace(target)
    }
  }, [loading, user, userLoading, walletStatus, pathname, router])

  const shouldShowGuardSpinner = userLoading || walletStatus === "loading"
  if (shouldShowGuardSpinner) {
    return (
      <OnboardingShell>
        <div className="flex flex-col items-center gap-3 py-6">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        </div>
      </OnboardingShell>
    )
  }

  const handleContinue = async () => {
    setLoading(true)
    try {
      await fetch("/api/user/type", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userType: selected }),
      })
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
      router.push("/dashboard")
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("account-type-title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("account-type-subtitle")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setSelected("person")}
          className={cn(
            "flex items-start gap-4 rounded-2xl border p-4 text-left transition-colors",
            selected === "person"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          )}
        >
          <div className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            selected === "person" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <User size={20} weight="duotone" />
          </div>
          <div>
            <p className="font-medium text-foreground">{t("account-type-individual")}</p>
            <p className="text-sm text-muted-foreground">{t("account-type-individual-desc")}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelected("business")}
          className={cn(
            "flex items-start gap-4 rounded-2xl border p-4 text-left transition-colors",
            selected === "business"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          )}
        >
          <div className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            selected === "business" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <Storefront size={20} weight="duotone" />
          </div>
          <div>
            <p className="font-medium text-foreground">{t("account-type-business")}</p>
            <p className="text-sm text-muted-foreground">{t("account-type-business-desc")}</p>
          </div>
        </button>
      </div>

      <Button className="w-full rounded-xl" onClick={handleContinue} disabled={loading}>
        {loading ? <><Spinner className="mr-2" />{t("saving")}</> : t("continue")}
      </Button>
    </OnboardingShell>
  )
}
