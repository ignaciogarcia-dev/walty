"use client"
import { UserPlus, ToggleLeft, Rocket } from "@phosphor-icons/react";
import { useTranslation } from "@/hooks/useTranslation";
import type { TranslationKey } from "@/locales";

const steps: { number: string; icon: typeof UserPlus; titleKey: TranslationKey; descKey: TranslationKey }[] = [
	{
		number: "01",
		icon: UserPlus,
		titleKey: "landing-step-1-title",
		descKey: "landing-step-1-desc",
	},
	{
		number: "02",
		icon: ToggleLeft,
		titleKey: "landing-step-2-title",
		descKey: "landing-step-2-desc",
	},
	{
		number: "03",
		icon: Rocket,
		titleKey: "landing-step-3-title",
		descKey: "landing-step-3-desc",
	},
];

export function HowItWorks() {
	const { t } = useTranslation();
	return (
		<section className="px-4 py-10">
			<div className="container mx-auto max-w-2xl">
				<div className="text-center mb-10">
					<h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{t("landing-how-it-works")}</h2>
					<p className="text-muted-foreground max-w-xl mx-auto">
						{t("landing-how-it-works-subtitle")}
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{steps.map((step, index) => {
						const Icon = step.icon;
						return (
							<div
								key={index}
								className="relative rounded-2xl border border-border bg-card backdrop-blur-md p-6"
							>
								{/* Step number */}
								<div className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-[#22c55e] flex items-center justify-center text-white font-bold text-sm">
									{step.number}
								</div>

								{/* Icon */}
								<div className="mb-4 mt-2">
									<div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#22c55e]/10 text-[#22c55e]">
										<Icon className="size-6" weight="duotone" />
									</div>
								</div>

								{/* Content */}
								<h3 className="text-lg font-semibold text-foreground mb-2">{t(step.titleKey)}</h3>
								<p className="text-sm text-muted-foreground">{t(step.descKey)}</p>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
