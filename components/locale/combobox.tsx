"use client"
import { isLocale, localeMap, type Locale } from "@/utils/locale"
import { Combobox, type ComboboxProps } from "@/components/ui/combobox"
import { useLocale } from "./provider"

const getLocaleOptions = () => {
	return Object.entries(localeMap).map(([value, label]) => ({
		value: value as Locale,
		label,
		keywords: [label],
	}))
}

type Props = Omit<ComboboxProps, "options" | "value" | "onValueChange">

export function LocaleCombobox(props: Props) {
	const { locale, setLocale } = useLocale()

	const onLocaleChange = (value: string | null) => {
		if (!value || !isLocale(value)) return
		setLocale(value as Locale)
	}

	return (
		<Combobox
			options={getLocaleOptions()}
			value={locale}
			onValueChange={onLocaleChange}
			{...props}
		/>
	)
}
