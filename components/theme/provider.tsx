"use client"
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react"
import type { Theme } from "@/utils/theme"

type ThemeContextValue = {
	theme: Theme
	setTheme: (value: Theme) => void
	toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

type Props = PropsWithChildren<{ initialTheme: Theme }>

export function ThemeProvider({ children, initialTheme }: Props) {
	const [theme, setThemeState] = useState<Theme>(initialTheme)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
		// Apply theme to document on mount
		const root = document.documentElement
		if (initialTheme === "dark") {
			root.classList.add("dark")
		} else {
			root.classList.remove("dark")
		}
	}, [initialTheme])

	useEffect(() => {
		if (!mounted) return
		// Apply theme to document when theme changes
		const root = document.documentElement
		if (theme === "dark") {
			root.classList.add("dark")
		} else {
			root.classList.remove("dark")
		}
	}, [theme, mounted])

	function setTheme(value: Theme) {
		setThemeState(value)
		if (mounted) {
			const root = document.documentElement
			if (value === "dark") {
				root.classList.add("dark")
			} else {
				root.classList.remove("dark")
			}
		}
		
		// Save to cookie
		document.cookie = `theme=${value}; path=/; max-age=31536000; SameSite=Lax`
	}

	function toggleTheme() {
		setTheme(theme === "dark" ? "light" : "dark")
	}

	return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
	const value = useContext(ThemeContext)

	if (!value) throw new Error("useTheme must be used within a ThemeProvider")

	return value
}
