"use client"
import { Reveal, RevealItem, RevealStagger } from "@/components/landing/Reveal"
import { useTranslation } from "@/hooks/useTranslation"
import { QrCode, Smartphone, Wallet } from "lucide-react"

export function HowItWorks() {
	const { t } = useTranslation()

	const steps = [
		{ n: "01", icon: QrCode, title: t("landing-step-1-title"), desc: t("landing-step-1-desc") },
		{ n: "02", icon: Smartphone, title: t("landing-step-2-title"), desc: t("landing-step-2-desc") },
		{ n: "03", icon: Wallet, title: t("landing-step-3-title"), desc: t("landing-step-3-desc") },
	]

	return (
		<section id="how-it-works" className="scroll-mt-24 bg-landing-bg">
			<div className="landing-container">
				<RevealStagger>
					<RevealItem>
						<h2 className="font-display max-w-2xl text-3xl font-bold tracking-tight text-foreground md:text-5xl">
							{t("landing-how-it-works")}
						</h2>
					</RevealItem>
					<RevealItem>
						<p className="mt-2 hidden max-w-xl text-base text-muted-foreground md:mt-4 md:block md:text-lg">
							{t("landing-how-it-works-subtitle")}
						</p>
					</RevealItem>
				</RevealStagger>

				{/* Mobile — single compact card */}
				<RevealStagger
					className="landing-head-gap divide-y divide-landing-hairline rounded-2xl border border-landing-hairline bg-landing-surface md:hidden"
				>
					{steps.map((step) => {
						const Icon = step.icon
						return (
							<RevealItem key={step.n} className="flex items-start gap-3 p-4">
								<span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-landing-hairline text-brand-strong">
									<Icon className="size-4" />
								</span>
								<div className="min-w-0">
									<p className="font-display text-sm font-semibold text-foreground">{step.title}</p>
									<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
								</div>
							</RevealItem>
						)
					})}
				</RevealStagger>

				{/* Desktop — step cards */}
				<div className="landing-head-gap hidden gap-6 md:grid md:grid-cols-3">
					{steps.map((step, i) => {
						const Icon = step.icon
						return (
							<Reveal key={step.n} delay={i * 0.1} className="md:h-full">
								<div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-landing-hairline bg-landing-surface p-8">
									<span
										className="font-display pointer-events-none absolute -right-2 -top-6 select-none text-[120px] font-bold leading-none text-brand/10"
										aria-hidden
									>
										{step.n}
									</span>
									<span className="relative flex size-12 items-center justify-center rounded-2xl border border-landing-hairline text-brand-strong">
										<Icon className="size-6" />
									</span>
									<h3 className="font-display relative mt-6 text-xl font-semibold text-foreground">{step.title}</h3>
									<p className="relative mt-3 text-base text-muted-foreground">{step.desc}</p>
								</div>
							</Reveal>
						)
					})}
				</div>
			</div>
		</section>
	)
}
