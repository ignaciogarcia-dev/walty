"use client"
import { useTranslation } from "@/hooks/useTranslation"
import { AnimatePresence, motion, useInView } from "motion/react"
import { useRef } from "react"

export function Footer() {
	const { t } = useTranslation()
	const ref = useRef(null)
	// useScroll + short last section often never crosses the 0.18 threshold; in-view is reliable for the footer.
	const isVisible = useInView(ref, { amount: 0.15, margin: "0px 0px 80px 0px", once: false })

	return (
		<footer
			ref={ref}
			className="border-t border-border/40 px-4 py-8 min-h-[5.5rem]"
		>
			<AnimatePresence>
				{isVisible && (
					<motion.div
						key="footer-content"
						initial={{ opacity: 0, y: 40, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 40, scale: 0.96 }}
						transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1], delay: 0.05 }}
						className="container mx-auto flex max-w-screen-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground"
					>
						<p className="text-balance">
							{t("landing-footer-copyright")}{" "}
							{t("landing-footer-license")}{" "}
							<a
								href="https://github.com/ignaciogarcia-dev"
								target="_blank"
								rel="noopener noreferrer"
								className="underline underline-offset-2 hover:text-foreground transition-colors"
							>
								@Ignacio Garcia
							</a>
						</p>
						<div className="flex items-center gap-4">
							<a
								href="https://github.com/ignaciogarcia-dev/walty/tree/main/docs"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-foreground transition-colors"
							>
								{t("landing-docs")}
							</a>
							<a
								href="https://github.com/ignaciogarcia-dev/walty"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-foreground transition-colors"
							>
								GitHub
							</a>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</footer>
	)
}
