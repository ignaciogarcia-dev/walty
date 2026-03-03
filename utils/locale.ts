import { cookies } from "next/headers"

export type Locale = "es" | "en"

const storageKey = "locale"
const defaultLocale: Locale = "es"

export const localeMap: Record<Locale, string> = {
	es: "Español",
	en: "English",
}

export function isLocale(locale: string): locale is Locale {
	return locale === "es" || locale === "en"
}

export async function getLocale(): Promise<Locale> {
	const cookieStore = await cookies()
	const locale = cookieStore.get(storageKey)?.value
	if (!locale || !isLocale(locale)) return defaultLocale
	return locale
}

export function getLocaleClient(): Locale {
	if (typeof window === "undefined") return defaultLocale
	const locale = document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${storageKey}=`))
		?.split("=")[1]
	if (!locale || !isLocale(locale)) return defaultLocale
	return locale
}
