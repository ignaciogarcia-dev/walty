export type Theme = "light" | "dark"

const storageKey = "theme"
const defaultTheme: Theme = "dark"

export function isTheme(theme: string): theme is Theme {
	return theme === "light" || theme === "dark"
}

// Server-side function - uses dynamic import to avoid bundling in client
export async function getTheme(): Promise<Theme> {
	const { cookies } = await import("next/headers")
	const cookieStore = await cookies()
	const theme = cookieStore.get(storageKey)?.value
	if (!theme || !isTheme(theme)) return defaultTheme
	return theme
}
