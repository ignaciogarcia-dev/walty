"use client"
import { useTranslation } from "@/hooks/useTranslation"

export default function SwapPage() {
	const { t } = useTranslation()
	
	return (
		<div className="mx-auto max-w-2xl px-4 py-10">
			<div className="rounded-xl border bg-card p-6">
				<p className="text-sm text-muted-foreground">{t("coming-soon")}</p>
			</div>
		</div>
	)
}
