"use client"
import { Reveal, RevealItem, RevealStagger } from "@/components/landing/Reveal"
import { useTranslation } from "@/hooks/useTranslation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Plus } from "lucide-react"
import { useState } from "react"

export function FAQ() {
	const { t } = useTranslation()
	const reduced = useReducedMotion()
	const [open, setOpen] = useState<number | null>(0)

	const items = [
		{ q: t("landing-faq-q1"), a: t("landing-faq-a1") },
		{ q: t("landing-faq-q2"), a: t("landing-faq-a2") },
		{ q: t("landing-faq-q3"), a: t("landing-faq-a3") },
		{ q: t("landing-faq-q4"), a: t("landing-faq-a4") },
		{ q: t("landing-faq-q5"), a: t("landing-faq-a5") },
	]

	return (
		<section className="bg-landing-bg">
			<div className="landing-container max-w-3xl">
				<Reveal>
					<h2 className="font-display text-center text-3xl font-bold tracking-tight text-foreground md:text-5xl">
						{t("landing-faq-title")}
					</h2>
				</Reveal>

				<RevealStagger
					className="landing-head-gap divide-y divide-landing-hairline rounded-3xl border border-landing-hairline bg-landing-surface"
				>
					{items.map((item, i) => {
						const isOpen = open === i
						return (
							<RevealItem key={item.q}>
								<button
									type="button"
									onClick={() => setOpen(isOpen ? null : i)}
									aria-expanded={isOpen}
									className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-brand/[0.03] md:gap-4 md:px-8 md:py-5"
								>
									<span className="font-display text-sm font-semibold text-foreground md:text-base">{item.q}</span>
									<Plus
										className={`size-5 shrink-0 text-brand-strong transition-transform duration-300 ${
											isOpen ? "rotate-45" : ""
										}`}
									/>
								</button>
								{reduced ? (
									isOpen && (
										<p className="px-5 pb-4 text-sm text-muted-foreground md:px-8 md:pb-5 md:text-base">{item.a}</p>
									)
								) : (
									<AnimatePresence initial={false}>
										{isOpen && (
											<motion.div
												initial={{ height: 0, opacity: 0 }}
												animate={{ height: "auto", opacity: 1 }}
												exit={{ height: 0, opacity: 0 }}
												transition={{ type: "spring", stiffness: 260, damping: 28 }}
												className="overflow-hidden"
											>
												<p className="px-5 pb-4 text-sm text-muted-foreground md:px-8 md:pb-5 md:text-base">{item.a}</p>
											</motion.div>
										)}
									</AnimatePresence>
								)}
							</RevealItem>
						)
					})}
				</RevealStagger>
			</div>
		</section>
	)
}
