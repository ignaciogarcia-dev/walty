"use client"
import { Combobox, type ComboboxProps } from "@/components/ui/combobox"
import { useTheme } from "./provider"
import { isTheme, type Theme } from "@/utils/theme"
import { useTranslation } from "@/hooks/useTranslation"

type Props = Omit<ComboboxProps, "options" | "value" | "onValueChange">

export function ThemeCombobox(props: Props) {
	const { t } = useTranslation()
	const { theme, setTheme } = useTheme()

	const themeMap: Record<Theme, string> = {
		light: t("light"),
		dark: t("dark"),
	}

	const options = Object.entries(themeMap).map(([value, label]) => ({
		value,
		label,
		keywords: [label],
	}))

	const onThemeChange = (value: string | null) => {
		if (!value || !isTheme(value)) return
		setTheme(value)
	}

	return (
		<Combobox
			options={options}
			value={theme}
			onValueChange={onThemeChange}
			{...props}
		/>
	)
}
