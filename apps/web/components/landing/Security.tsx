"use client"
import { Reveal } from "@/components/landing/Reveal"
import { useTranslation } from "@/hooks/useTranslation"
import { Check, KeyRound, Server, Smartphone } from "lucide-react"

export function Security() {
	const { t } = useTranslation()

	const shares = [
		{ icon: Smartphone, label: t("landing-security-share-device"), desc: t("landing-security-share-device-desc") },
		{ icon: Server, label: t("landing-security-share-server"), desc: t("landing-security-share-server-desc") },
		{ icon: KeyRound, label: t("landing-security-share-backup"), desc: t("landing-security-share-backup-desc") },
	]

	const points = [t("landing-security-point-1"), t("landing-security-point-2"), t("landing-security-point-3")]

	return (
		<section id="security" className="scroll-mt-24 bg-landing-bg">
			<div className="landing-container grid items-center gap-8 md:gap-12 lg:grid-cols-2 lg:gap-16 [&>*]:min-w-0">
				{/* Copy */}
				<Reveal>
					<span className="inline-flex items-center rounded-full border border-landing-hairline px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-strong">
						{t("landing-security-eyebrow")}
					</span>
					<h2 className="font-display mt-5 text-3xl font-bold tracking-tight text-foreground md:mt-6 md:text-5xl">
						{t("landing-security-title")}
					</h2>
					<p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground md:mt-4 md:text-lg">
						{t("landing-security-desc")}
					</p>
					<ul className="mt-6 space-y-3 md:mt-8 md:space-y-4">
						{points.map((p) => (
							<li key={p} className="flex items-center gap-3 text-foreground">
								<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-strong">
									<Check className="size-4" />
								</span>
								{p}
							</li>
						))}
					</ul>
				</Reveal>

				{/* 3-of-3 shares diagram — desktop only */}
				<Reveal delay={0.1} direction="right" className="hidden md:block">
					<div className="relative overflow-hidden rounded-3xl border border-landing-hairline bg-landing-surface p-5 md:p-8">
						<span className="absolute right-5 top-5 z-[1] rounded-full bg-brand px-3 py-1 text-xs font-semibold text-[#06120b] md:right-6 md:top-6">
							2 / 3
						</span>
						<div className="space-y-3 pt-8 md:pt-0">
							{shares.map((s) => {
								const Icon = s.icon
								return (
									<div
										key={s.label}
										className="flex items-start gap-3 rounded-2xl border border-landing-hairline bg-landing-bg p-5 md:gap-4 md:p-6"
									>
										<span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-landing-hairline text-brand-strong md:size-11">
											<Icon className="size-5" />
										</span>
										<div className="min-w-0">
											<p className="font-display text-sm font-semibold text-foreground md:text-base">{s.label}</p>
											<p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{s.desc}</p>
										</div>
									</div>
								)
							})}
						</div>
					</div>
				</Reveal>
			</div>
		</section>
	)
}
