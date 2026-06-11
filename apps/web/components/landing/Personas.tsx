"use client"
import { Reveal } from "@/components/landing/Reveal"
import { useTranslation } from "@/hooks/useTranslation"
import { ArrowRight } from "lucide-react"

const WALLET_GRADIENT =
	"linear-gradient(140deg, var(--wallet-balance-gradient-start), var(--wallet-balance-gradient-middle) 65%, var(--wallet-balance-gradient-end))"

export function Personas() {
	const { t } = useTranslation()

	return (
		<section className="bg-landing-bg">
			<div className="landing-container">
				{/* Mobile — primary CTA only */}
				<Reveal className="lg:hidden">
					<div
						className="relative overflow-hidden rounded-2xl p-5 text-white"
						style={{ background: WALLET_GRADIENT }}
					>
						<div className="grain-overlay" />
						<h3 className="font-display relative text-xl font-bold tracking-tight">{t("landing-for-businesses")}</h3>
						<p className="relative mt-2 text-sm text-white/85">{t("landing-for-businesses-desc")}</p>
						<a
							href="/onboarding"
							className="relative mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#06120b] transition-colors hover:bg-white/90"
						>
							{t("landing-for-businesses-cta")}
							<ArrowRight className="size-4" />
						</a>
						<p className="relative mt-4 text-xs text-white/70">
							{t("landing-for-people")}{" "}
							<a
								href="https://github.com/ignaciogarcia-dev/walty/tree/main/docs"
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium text-white underline underline-offset-2"
							>
								{t("landing-for-people-cta")}
							</a>
						</p>
					</div>
				</Reveal>

				{/* Desktop — two cards */}
				<div className="hidden gap-6 lg:grid lg:grid-cols-2">
					<Reveal className="md:h-full">
						<div
							className="relative flex h-full flex-col overflow-hidden rounded-3xl p-12 text-white"
							style={{ background: WALLET_GRADIENT }}
						>
							<div className="grain-overlay" />
							<h3 className="font-display relative text-4xl font-bold tracking-tight">{t("landing-for-businesses")}</h3>
							<p className="relative mt-4 max-w-md text-base text-white/85">{t("landing-for-businesses-desc")}</p>
							<a
								href="/onboarding"
								className="relative mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-white px-7 py-3 text-base font-semibold text-[#06120b] transition-colors hover:bg-white/90"
							>
								{t("landing-for-businesses-cta")}
								<ArrowRight className="size-4" />
							</a>
						</div>
					</Reveal>

					<Reveal delay={0.08} className="md:h-full">
						<div className="flex h-full flex-col rounded-3xl border border-landing-hairline bg-landing-surface p-12">
							<h3 className="font-display text-4xl font-bold tracking-tight text-foreground">{t("landing-for-people")}</h3>
							<p className="mt-4 max-w-md text-base text-muted-foreground">{t("landing-for-people-desc")}</p>
							<a
								href="https://github.com/ignaciogarcia-dev/walty/tree/main/docs"
								target="_blank"
								rel="noopener noreferrer"
								className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-brand px-7 py-3 text-base font-semibold text-[#06120b] transition-colors hover:bg-brand/90"
							>
								{t("landing-for-people-cta")}
								<ArrowRight className="size-4" />
							</a>
						</div>
					</Reveal>
				</div>
			</div>
		</section>
	)
}
