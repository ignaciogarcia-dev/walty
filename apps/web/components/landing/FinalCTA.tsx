"use client"
import { Reveal } from "@/components/landing/Reveal"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/useTranslation"
import Link from "next/link"

const WALLET_GRADIENT =
	"linear-gradient(135deg, var(--wallet-balance-gradient-start), var(--wallet-balance-gradient-middle) 60%, var(--wallet-balance-gradient-end))"

export function FinalCTA() {
	const { t } = useTranslation()

	return (
		<section className="bg-landing-bg">
			<div className="landing-container">
				<Reveal>
					<div
						className="relative overflow-hidden rounded-3xl px-6 py-12 text-center text-white md:rounded-[2rem] md:px-12 md:py-20"
						style={{ background: WALLET_GRADIENT }}
					>
						<div className="grain-overlay" />
						<h2 className="font-display relative mx-auto max-w-2xl text-3xl font-bold tracking-tight md:text-5xl">
							{t("landing-cta-title")}
						</h2>
						<p className="relative mx-auto mt-3 max-w-md text-base text-white/85 md:mt-4 md:text-lg">
							{t("landing-cta-desc")}
						</p>
						<div className="relative mt-6 flex justify-center md:mt-8">
							<Button
								asChild
								size="lg"
								className="rounded-full bg-white px-8 font-semibold text-[#06120b] hover:bg-white/90"
							>
								<Link href="/onboarding">{t("landing-open-account")}</Link>
							</Button>
						</div>
					</div>
				</Reveal>
			</div>
		</section>
	)
}
