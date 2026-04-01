"use client"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme/provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
	const { theme, toggleTheme } = useTheme()

	return (
		<Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
			{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
		</Button>
	)
}
