"use client"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/useTranslation"
import { motion } from "motion/react"
import Link from "next/link"

const MotionLink = motion.create(Link)

const ctaLabelRoll = {
	initial: { y: "0%" },
	hover: {
		y: "-50%",
		transition: { type: "spring" as const, stiffness: 420, damping: 28 },
	},
}

export function Hero() {
	const { t } = useTranslation()
	const ctaLabel = t("landing-get-started")

	return (
		<section className="container mx-auto flex max-md:h-[70vh] flex-col items-center justify-center gap-6 px-4 pt-14 text-center">
			<h1 className="whitespace-pre-line text-[70px] md:text-[130px] font-extrabold leading-[0.8] tracking-tighter text-[#22c55e]">
				{t("landing-hero-title")}
			</h1>
			<Button asChild size="xl" variant="accent" className="btn-hero text-xl md:text-2xl hover:bg-foreground hover:text-background active:bg-foreground active:text-background">
				<MotionLink href="/login" initial="initial" whileHover="hover" whileTap="hover">
					<span className="inline-block overflow-hidden align-baseline h-[1.15em]">
						<motion.span className="flex flex-col leading-[1.1]" variants={ctaLabelRoll}>
							<span className="block">{ctaLabel}</span>
							<span className="block" aria-hidden>
								{ctaLabel}
							</span>
						</motion.span>
					</span>
				</MotionLink>
			</Button>
		</section>
	)
}
