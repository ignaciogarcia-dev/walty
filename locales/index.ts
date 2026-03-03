import type { Locale } from "@/utils/locale"
import { es } from "./es"
import { en } from "./en"

export const translations = {
	es,
	en,
} as const

export type TranslationKey = keyof typeof es

export function t(key: TranslationKey, locale: Locale = "es"): string {
	const localeTranslations = translations[locale]
	if (localeTranslations && key in localeTranslations) {
		return localeTranslations[key] as string
	}
	// Fallback to Spanish if key not found in requested locale
	const fallback = translations.es[key]
	if (fallback) {
		return fallback as string
	}
	// Last resort: return the key itself
	return key
}
