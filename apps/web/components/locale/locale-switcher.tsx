"use client"
import { useLocale } from "@/components/locale/provider"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/utils/locale"

const localeLabel: Record<Locale, string> = {
	en: "🇺🇸 EN",
	es: "🇪🇸 ES",
}

export function LocaleSwitcher() {
	const { locale, setLocale } = useLocale()
	const next: Locale = locale === "en" ? "es" : "en"

	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={() => setLocale(next)}
			className="text-xs font-medium px-2"
		>
			{localeLabel[next]}
		</Button>
	)
}
