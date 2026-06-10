"use client"
import { Button } from "@/components/ui/button"
import { useLocale } from "@/components/locale/provider"
import { t } from "@/locales"

// Localized fallback UI shared by every error boundary.
export function ErrorFallback({ reset }: { reset: () => void }) {
  const { locale } = useLocale()

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {t("error-title", locale)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("error-description", locale)}
        </p>
        <Button onClick={reset} className="w-full rounded-xl">
          {t("error-retry", locale)}
        </Button>
      </div>
    </div>
  )
}
