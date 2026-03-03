"use client"
import { Globe } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useLocale } from "./provider"
import { localeMap, type Locale } from "@/utils/locale"

export function LocaleSelector() {
	const { locale, setLocale } = useLocale()

	return (
		<div className="flex items-center gap-2 rounded-md border p-1">
			{(Object.entries(localeMap) as [Locale, string][]).map(([value, label]) => (
				<Button
					key={value}
					variant={locale === value ? "default" : "ghost"}
					size="sm"
					onClick={() => setLocale(value)}
					className="flex-1"
				>
					<Globe className="h-4 w-4 mr-1" />
					{label}
				</Button>
			))}
		</div>
	)
}
