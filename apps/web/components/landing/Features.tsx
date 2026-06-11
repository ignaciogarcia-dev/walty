"use client"
import { Reveal, RevealItem, RevealStagger } from "@/components/landing/Reveal"
import { useTranslation } from "@/hooks/useTranslation"
import { Coins, QrCode, ShieldCheck, Undo2, Users } from "lucide-react"

const WALLET_GRADIENT =
	"linear-gradient(150deg, var(--wallet-balance-gradient-start), var(--wallet-balance-gradient-middle) 70%, var(--wallet-balance-gradient-end))"

const featureItems = [
	{ icon: Coins, titleKey: "landing-feature-fees-title", descKey: "landing-feature-fees-desc" },
	{ icon: Users, titleKey: "landing-feature-team-title", descKey: "landing-feature-team-desc" },
	{ icon: Undo2, titleKey: "landing-feature-refunds-title", descKey: "landing-feature-refunds-desc" },
	{ icon: QrCode, titleKey: "landing-feature-qr-title", descKey: "landing-feature-qr-desc" },
] as const

export function Features() {
	const { t } = useTranslation()

	return (
		<section id="features" className="scroll-mt-24 bg-landing-bg">
			<div className="landing-container">
				<Reveal>
					<h2 className="font-display max-w-3xl text-3xl font-bold tracking-tight text-foreground md:text-5xl">
						{t("landing-features-title")}
					</h2>
				</Reveal>

				{/* Mobile — hero + compact list */}
				<div className="landing-head-gap space-y-4 md:hidden">
					<Reveal>
						<div
							className="relative overflow-hidden rounded-2xl p-5 text-white"
							style={{ background: WALLET_GRADIENT }}
						>
							<div className="grain-overlay" />
							<ShieldCheck className="relative size-7" />
							<h3 className="font-display relative mt-4 text-lg font-bold tracking-tight">
								{t("landing-feature-custody-title")}
							</h3>
							<p className="relative mt-1.5 text-sm text-white/80">{t("landing-feature-custody-desc")}</p>
						</div>
					</Reveal>

					<RevealStagger
						className="divide-y divide-landing-hairline rounded-2xl border border-landing-hairline bg-landing-surface"
					>
						{featureItems.map(({ icon: Icon, titleKey, descKey }) => (
							<RevealItem key={titleKey} className="flex items-start gap-3 p-4">
								<span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-landing-hairline text-brand-strong">
									<Icon className="size-4" />
								</span>
								<div className="min-w-0">
									<p className="font-display text-sm font-semibold text-foreground">{t(titleKey)}</p>
									<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(descKey)}</p>
								</div>
							</RevealItem>
						))}
					</RevealStagger>
				</div>

				{/* Desktop — bento grid */}
				<div className="landing-head-gap hidden gap-6 md:grid md:grid-cols-3 md:grid-rows-[repeat(3,minmax(0,auto))]">
					<Reveal className="md:h-full md:row-span-2">
						<div
							className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl p-8 text-white"
							style={{ background: WALLET_GRADIENT }}
						>
							<div className="grain-overlay" />
							<ShieldCheck className="relative size-9" />
							<div className="relative mt-8">
								<h3 className="font-display text-2xl font-bold tracking-tight">{t("landing-feature-custody-title")}</h3>
								<p className="mt-3 max-w-xs text-base text-white/80">{t("landing-feature-custody-desc")}</p>
							</div>
						</div>
					</Reveal>

					{featureItems.map(({ icon, titleKey, descKey }, i) => (
						<FeatureTile
							key={titleKey}
							icon={icon}
							title={t(titleKey)}
							desc={t(descKey)}
							delay={i * 0.08}
						/>
					))}
				</div>
			</div>
		</section>
	)
}

function FeatureTile({
	icon: Icon,
	title,
	desc,
	delay,
}: {
	icon: typeof Coins
	title: string
	desc: string
	delay: number
}) {
	return (
		<Reveal delay={delay} className="md:h-full">
			<div className="flex h-full flex-col rounded-3xl border border-landing-hairline bg-landing-surface p-8">
				<span className="flex size-12 items-center justify-center rounded-2xl border border-landing-hairline text-brand-strong">
					<Icon className="size-6" />
				</span>
				<h3 className="font-display mt-6 text-xl font-semibold text-foreground">{title}</h3>
				<p className="mt-3 text-base text-muted-foreground">{desc}</p>
			</div>
		</Reveal>
	)
}
