"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { OnboardingShell } from "../_components/shell"
import { User, Storefront } from "@phosphor-icons/react"
import { cn } from "@/utils/style"

type UserType = "person" | "business"

export default function AccountTypePage() {
  const router = useRouter()
  const [selected, setSelected] = useState<UserType>("person")
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    setLoading(true)
    try {
      await fetch("/api/user/type", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userType: selected }),
      })
    } finally {
      router.push("/onboarding/complete")
    }
  }

  return (
    <OnboardingShell>
      <div>
        <h2 className="text-lg font-semibold text-foreground">¿Qué tipo de cuenta quieres?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Puedes cambiarlo más adelante desde ajustes.</p>
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
            <p className="font-medium text-foreground">Persona</p>
            <p className="text-sm text-muted-foreground">Para usar la app y pagar</p>
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
            <p className="font-medium text-foreground">Negocio</p>
            <p className="text-sm text-muted-foreground">Para cobrar pagos</p>
          </div>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <Button className="w-full rounded-xl" onClick={handleContinue} disabled={loading}>
          {loading ? <><Spinner className="mr-2" />Guardando...</> : "Continuar"}
        </Button>
        <Button
          variant="ghost"
          className="w-full rounded-xl"
          onClick={() => router.push("/onboarding/complete")}
        >
          Omitir
        </Button>
      </div>
    </OnboardingShell>
  )
}
