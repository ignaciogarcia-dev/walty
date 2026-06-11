"use client"
import { WaltyLogo } from "@/components/landing/WaltyLogo"
import { useTranslation } from "@/hooks/useTranslation"

export function Footer() {
	const { t } = useTranslation()

	return (
		<footer className="border-t border-landing-hairline bg-landing-bg py-10">
			<div className="landing-container flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<WaltyLogo size={24} className="size-6" />
					<span className="text-balance">
						{t("landing-footer-copyright")} {t("landing-footer-license")}
					</span>
				</div>
				<div className="flex items-center gap-5">
					<a
						href="https://github.com/ignaciogarcia-dev/walty/tree/main/docs"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-foreground"
					>
						{t("landing-docs")}
					</a>
					<a
						href="https://github.com/ignaciogarcia-dev/walty"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-foreground"
					>
						{t("landing-github")}
					</a>
				</div>
			</div>
		</footer>
	)
}
