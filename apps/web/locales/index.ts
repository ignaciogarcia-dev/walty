import type { Locale } from "@/utils/locale"
import { es } from "./es"
import { en } from "./en"

export const translations = {
	es,
	en,
} as const

export type TranslationKey = keyof typeof es
export type TranslationParams = Record<string, string | number>

export function t(
	key: TranslationKey,
	locale: Locale = "es",
	params?: TranslationParams,
): string {
	const localeTranslations = translations[locale]
	let value: string

	if (localeTranslations && key in localeTranslations) {
		value = localeTranslations[key] as string
	} else {
		// Fallback to Spanish if key not found in requested locale
		const fallback = translations.es[key]
		value = fallback ? (fallback as string) : key
	}

	if (!params) return value

	return Object.entries(params).reduce((result, [paramKey, paramValue]) => {
		return result.replaceAll(`{${paramKey}}`, String(paramValue))
	}, value)
}
