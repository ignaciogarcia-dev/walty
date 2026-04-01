"use client"
import { Card, CardContent } from "@/components/ui/card"
import Spline from "@splinetool/react-spline"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { DollarSign, HandCoins } from "lucide-react"
import { useTranslation } from "@/hooks/useTranslation"

const lerp = (a: number, b: number, t: number) =>
	a + (b - a) * t

export function Banner() {
	const { t } = useTranslation()
	const [scale, setScale] = useState(1)

	useEffect(() => {
		// Two calibrated anchors — lerp extrapolates linearly for any screen
		const ANCHOR_A = { vh: 730, scale: 1.25 }  // small screens
		const ANCHOR_B = { vh: 945, scale: 1.05 }  // large screens

		const SCROLL_RATIO = 0.5

		const handle = () => {
			const vh = window.innerHeight

			// linear interpolation/extrapolation across any viewport height
			const t = (vh - ANCHOR_A.vh) / (ANCHOR_B.vh - ANCHOR_A.vh)
			const scaleTop = lerp(ANCHOR_A.scale, ANCHOR_B.scale, t)
			const scaleScrolled = scaleTop * SCROLL_RATIO

			const scrolled = window.scrollY > 0
			setScale(scrolled ? scaleScrolled : scaleTop)
		}

		handle()
		window.addEventListener("scroll", handle)
		window.addEventListener("resize", handle)

		return () => {
			window.removeEventListener("scroll", handle)
			window.removeEventListener("resize", handle)
		}
	}, [])

	const isCardVisible = scale < 1

	return (
		<section className="w-full h-screen md:h-screen overflow-hidden flex items-center justify-center relative">
			<AnimatePresence>
				{isCardVisible && (
					<>
						<motion.div
							key="card-left"
							initial={{
								opacity: 0,
								rotateX: -45,
								rotateY: 25,
								rotateZ: -15,
								scale: 0.8,
								x: -100
							}}
							animate={{
								opacity: 1,
								rotateX: 0,
								rotateY: 0,
								rotateZ: 0,
								scale: 1,
								x: 0
							}}
							exit={{
								opacity: 0,
								rotateX: -45,
								rotateY: 25,
								rotateZ: -15,
								scale: 0.8,
								x: -100
							}}
							transition={{
								duration: 0.6,
								ease: [0.34, 1.56, 0.64, 1],
								delay: 0.1
							}}
							className="absolute left-[10%] w-1/4 h-3/4"
							style={{ transformStyle: "preserve-3d" }}
						>
							<Card className="w-full h-full relative overflow-hidden border-0 bg-[#22C55E]">
								<svg
									className="absolute top-0 right-0 h-full opacity-20 pointer-events-none"
									viewBox="0 0 200 500"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M200 0L40 180V500H200V0Z" fill="white" />
									<circle cx="150" cy="90" r="70" fill="white" opacity="0.3" />
									<circle cx="100" cy="400" r="40" fill="white" opacity="0.15" />
								</svg>
								<CardContent className="relative z-10 flex flex-col h-full p-6">
									<div className="flex-1 flex items-center justify-center">
										<DollarSign className="h-24 w-24 text-white" />
									</div>
									<div>
										<h3 className="text-4xl font-bold text-white text-left">{t("landing-pay-title")}</h3>
										<p className="text-md text-white/80 mt-2 text-left">{t("landing-pay-desc")}</p>
									</div>
								</CardContent>
							</Card>
						</motion.div>
						<motion.div
							key="card-center"
							initial={{
								opacity: 0,
								rotateX: 45,
								rotateY: -20,
								rotateZ: 10,
								scale: 0.8,
								y: -50
							}}
							animate={{
								opacity: 1,
								rotateX: 0,
								rotateY: 0,
								rotateZ: 0,
								scale: 1,
								y: 0
							}}
							exit={{
								opacity: 0,
								rotateX: 45,
								rotateY: -20,
								rotateZ: 10,
								scale: 0.8,
								y: -50
							}}
							transition={{
								duration: 0.6,
								ease: [0.34, 1.56, 0.64, 1],
								delay: 0.2
							}}
							className="absolute left-1/2 -translate-x-1/2 w-1/4 h-3/4"
							style={{ transformStyle: "preserve-3d" }}
						>
							<Card className="w-full h-full relative overflow-hidden border-0 bg-[#0a1a0f]">
								<svg
									className="absolute bottom-0 left-0 w-full h-full opacity-15 pointer-events-none"
									viewBox="0 0 200 500"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M0 500L0 200L160 320V500Z" fill="#22C55E" />
									<path d="M200 0L200 250L80 150V0Z" fill="#22C55E" opacity="0.25" />
									<circle cx="100" cy="250" r="55" fill="#22C55E" opacity="0.2" />
								</svg>
								<CardContent>
								</CardContent>
							</Card>
						</motion.div>
						<motion.div
							key="card-right"
							initial={{
								opacity: 0,
								rotateX: -30,
								rotateY: -30,
								rotateZ: 20,
								scale: 0.8,
								x: 100
							}}
							animate={{
								opacity: 1,
								rotateX: 0,
								rotateY: 0,
								rotateZ: 0,
								scale: 1,
								x: 0
							}}
							exit={{
								opacity: 0,
								rotateX: -30,
								rotateY: -30,
								rotateZ: 20,
								scale: 0.8,
								x: 100
							}}
							transition={{
								duration: 0.6,
								ease: [0.34, 1.56, 0.64, 1],
								delay: 0.3
							}}
							className="absolute right-[10%] w-1/4 h-3/4"
							style={{ transformStyle: "preserve-3d" }}
						>
							<Card className="w-full h-full relative overflow-hidden border-0 bg-[#22C55E]">
								<svg
									className="absolute bottom-0 left-0 h-full opacity-20 pointer-events-none"
									viewBox="0 0 200 500"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M0 500L160 300V0H0V500Z" fill="white" />
									<circle cx="50" cy="420" r="60" fill="white" opacity="0.3" />
									<circle cx="140" cy="80" r="35" fill="white" opacity="0.15" />
								</svg>
								<CardContent className="relative z-10 flex flex-col h-full p-6">

									<div className="flex-1 flex items-center justify-center">
										<HandCoins className="h-24 w-24 text-white" />
									</div>
									<div>
										<h3 className="text-4xl font-bold text-white">{t("landing-collect")}</h3>
										<p className="text-md text-white/80 mt-2">{t("landing-collect-desc")}</p>

									</div>
								</CardContent>
							</Card>
						</motion.div>
					</>
				)}
			</AnimatePresence>
			<Spline
				className="flex w-full h-full items-center justify-center transition-transform duration-500 ease-out"
				style={{ transform: `scale(${scale}) translateY(${(1 - scale) * 20}vh)` }}
				scene="https://prod.spline.design/TmVdLNC30z-72hpK/scene.splinecode"
			/>

		</section >
	)
}
