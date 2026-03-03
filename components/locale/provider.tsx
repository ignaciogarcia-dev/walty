"use client"
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react"
import type { Locale } from "@/utils/locale"
import { getLocaleClient } from "@/utils/locale"

type LocaleContextValue = {
	locale: Locale
	setLocale: (value: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

type Props = PropsWithChildren<{ initialLocale: Locale }>

export function LocaleProvider({ children, initialLocale }: Props) {
	const [locale, setLocaleState] = useState<Locale>(initialLocale)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	function setLocale(value: Locale) {
		setLocaleState(value)
		
		// Save to cookie
		document.cookie = `locale=${value}; path=/; max-age=31536000; SameSite=Lax`
		
		// Reload page to apply locale changes
		if (mounted) {
			window.location.reload()
		}
	}

	return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
	const value = useContext(LocaleContext)

	if (!value) throw new Error("useLocale must be used within a LocaleProvider")

	return value
}
