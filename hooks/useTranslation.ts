"use client"
import { useLocale } from "@/components/locale/provider"
import { t as translate } from "@/locales"

export function useTranslation() {
	const { locale } = useLocale()
	
	return {
		t: (key: Parameters<typeof translate>[0]) => translate(key, locale),
		locale,
	}
}
