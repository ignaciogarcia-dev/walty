"use client"
import { useTranslation } from "@/hooks/useTranslation"
import { ArrowRight } from "lucide-react"
import { AnimatePresence, motion, useScroll } from "motion/react"
import { useEffect, useRef, useState } from "react"

export function Personas() {
	const { t } = useTranslation()
	const ref = useRef<HTMLDivElement | null>(null)
	const [isVisible, setIsVisible] = useState(false)

	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start end", "end start"],
	})

	useEffect(() => {
		const unsubscribe = scrollYProgress.on("change", (v) => {
			if (v > 0.1) setIsVisible(true)
			if (v < 0.02) setIsVisible(false)
		})
		return () => unsubscribe()
	}, [scrollYProgress])

	return (
		<section
			ref={ref}
			className="px-4 md:px-0 md:mx-[10%] grid grid-cols-1 lg:grid-cols-2 gap-6 my-24 min-h-[450px]"
		>
			<AnimatePresence>
				{isVisible && (
					<>
						{/* Business Card */}
						<motion.div
							key="personas-business"
							initial={{ opacity: 0, y: 40, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 40, scale: 0.96 }}
							transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1], delay: 0.05 }}
						>
							<div className="relative overflow-hidden rounded-3xl bg-[#22C55E] min-h-[450px] p-12 flex flex-col items-center justify-center text-center">
								<h3 className="text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
									{t("landing-for-businesses")}
								</h3>
								<p className="text-white/80 text-lg leading-relaxed max-w-md">
									{t("landing-for-businesses-desc")}
								</p>
								<a
									href="/onboarding"
									className="mt-8 inline-flex items-center gap-2 bg-white text-[#22C55E] font-bold uppercase tracking-wide px-8 py-4 rounded-full hover:bg-white/90 transition-colors"
								>
									{t("landing-for-businesses-cta")}
									<ArrowRight className="h-5 w-5" />
								</a>
							</div>
						</motion.div>

						{/* People Card */}
						<motion.div
							key="personas-people"
							initial={{ opacity: 0, y: 40, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 40, scale: 0.96 }}
							transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1], delay: 0.12 }}
						>
							<div className="relative overflow-hidden rounded-3xl bg-[#0a1a0f] min-h-[450px] p-12 flex flex-col items-center justify-center text-center">
								<h3 className="text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
									{t("landing-for-people")}
								</h3>
								<p className="text-white/60 text-lg leading-relaxed max-w-md">
									{t("landing-for-people-desc")}
								</p>
								<a
									href="/onboarding"
									className="mt-8 inline-flex items-center gap-2 bg-[#22C55E] text-white font-bold uppercase tracking-wide px-8 py-4 rounded-full hover:bg-[#22C55E]/90 transition-colors"
								>
									{t("landing-for-people-cta")}
									<ArrowRight className="h-5 w-5" />
								</a>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</section>
	)
}
