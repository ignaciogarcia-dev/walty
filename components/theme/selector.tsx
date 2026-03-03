"use client"
import { Moon, Sun } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useTheme } from "./provider"

export function ThemeSelector() {
	const { theme, setTheme } = useTheme()

	return (
		<div className="flex items-center gap-2 rounded-md border p-1">
			<Button
				variant={theme === "light" ? "default" : "ghost"}
				size="sm"
				onClick={() => setTheme("light")}
				className="flex-1"
			>
				<Sun className="h-4 w-4" />
				<span className="sr-only">Light</span>
			</Button>
			<Button
				variant={theme === "dark" ? "default" : "ghost"}
				size="sm"
				onClick={() => setTheme("dark")}
				className="flex-1"
			>
				<Moon className="h-4 w-4" />
				<span className="sr-only">Dark</span>
			</Button>
		</div>
	)
}
