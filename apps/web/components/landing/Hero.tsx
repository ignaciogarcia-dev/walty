"use client"
import { CountUp, MaskReveal, Reveal, RevealItem, RevealStagger } from "@/components/landing/Reveal"
import { WaltyLogo } from "@/components/landing/WaltyLogo"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/useTranslation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowDownLeft, Check } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const WALLET_GRADIENT =
	"linear-gradient(135deg, var(--wallet-balance-gradient-start), var(--wallet-balance-gradient-middle) 55%, var(--wallet-balance-gradient-end))"

function QrGlyph({ className }: { className?: string }) {
	// Decorative QR on a 21×21 module grid. Not scannable.
	const modules = 21
	const unit = 4
	const view = modules * unit
	const finderOrigins: [number, number][] = [
		[0, 0],
		[0, modules - 7],
		[modules - 7, 0],
	]

	function finderAt(row: number, col: number): boolean | null {
		for (const [originRow, originCol] of finderOrigins) {
			if (row >= originRow && row < originRow + 7 && col >= originCol && col < originCol + 7) {
				const localRow = row - originRow
				const localCol = col - originCol
				const outer =
					localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6
				const inner =
					localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4
				return outer || inner
			}
		}
		return null
	}

	function isSeparator(row: number, col: number): boolean {
		return (
			(row === 7 && col < 8) ||
			(col === 7 && row < 8) ||
			(row === 7 && col >= modules - 8) ||
			(col === modules - 8 && row < 8) ||
			(row === modules - 8 && col < 8) ||
			(col === 7 && row >= modules - 8)
		)
	}

	const rects = []
	for (let row = 0; row < modules; row++) {
		for (let col = 0; col < modules; col++) {
			if (isSeparator(row, col)) continue

			const finder = finderAt(row, col)
			const filled =
				finder !== null
					? finder
					: row === 6 || col === 6
						? (row + col) % 2 === 0
						: ((row * 17 + col * 31 + (row ^ col) * 7) % 11) > 4

			if (filled) {
				rects.push(
					<rect
						key={`${row}-${col}`}
						x={col * unit}
						y={row * unit}
						width={unit}
						height={unit}
						fill="currentColor"
					/>,
				)
			}
		}
	}

	return (
		<svg viewBox={`0 0 ${view} ${view}`} className={className} aria-hidden shapeRendering="crispEdges">
			{rects}
		</svg>
	)
}

function TxRow({ label, amount, muted }: { label: string; amount: string; muted?: boolean }) {
	return (
		<div className="flex items-center gap-3 py-2.5">
			<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-strong" aria-hidden>
				<ArrowDownLeft className="size-4" />
			</span>
			<span className={`flex-1 text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>{label}</span>
			<span className="text-sm font-semibold tabular-nums text-brand-strong">{amount}</span>
		</div>
	)
}

function DemoCard() {
	const { t } = useTranslation()
	const reduced = useReducedMotion()
	const [showToast, setShowToast] = useState(false)

	// One-time "payment received" toast — appears once, then settles. Not a loop.
	useEffect(() => {
		if (reduced) return
		const toShow = setTimeout(() => setShowToast(true), 900)
		const toHide = setTimeout(() => setShowToast(false), 3600)
		return () => {
			clearTimeout(toShow)
			clearTimeout(toHide)
		}
	}, [reduced])

	return (
		<div className="relative" role="img" aria-label={`${t("landing-demo-balance-label")}: $12,480.00 USDC`}>
			{/* One-time payment toast (does not overlap the transaction rows) */}
			<AnimatePresence>
				{showToast && (
					<motion.div
						initial={{ opacity: 0, y: -10, x: 10 }}
						animate={{ opacity: 1, y: 0, x: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.35, ease: [0.34, 1.2, 0.64, 1] }}
						className="absolute -top-4 right-4 z-10 flex items-center gap-2 rounded-full border border-landing-hairline bg-landing-surface px-3 py-1.5"
					>
						<span className="flex size-5 items-center justify-center rounded-full bg-brand/15 text-brand-strong">
							<Check className="size-3.5" />
						</span>
						<span className="text-xs font-medium text-foreground">{t("landing-demo-tx")}</span>
						<span className="text-xs font-semibold tabular-nums text-brand-strong">+$250.00</span>
					</motion.div>
				)}
			</AnimatePresence>

			<div className="relative overflow-hidden rounded-3xl border border-landing-hairline bg-landing-surface p-5 sm:p-8">
				<div className="flex items-start justify-between">
					<div>
						<p className="text-xs text-muted-foreground">{t("landing-demo-balance-label")}</p>
						<p className="font-display mt-1 text-4xl font-bold tracking-tight tabular-nums text-foreground">
							<span className="text-muted-foreground">$ </span>
							<CountUp value={12480} />
						</p>
					</div>
					<span className="rounded-full border border-landing-hairline px-2.5 py-1 text-[11px] font-medium text-brand-strong">
						USDC
					</span>
				</div>

				{/* Payment-card strip with embedded QR (reads as "scan to pay") */}
				<div className="relative mt-6 flex h-24 items-end justify-between overflow-hidden rounded-2xl p-4" style={{ background: WALLET_GRADIENT }}>
					<div className="grain-overlay" />
					<div className="relative">
						<WaltyLogo size={28} className="size-7" />
						<span className="mt-1.5 block text-[11px] font-medium text-white/80">
							Polygon · {t("landing-demo-qr-caption")}
						</span>
					</div>
					<div className="size-16 shrink-0 rounded-xl bg-white p-2">
						<QrGlyph className="size-full text-[#06120b]" />
					</div>
				</div>

				{/* Transaction rows — amounts always visible */}
				<div className="mt-2 divide-y divide-landing-hairline">
					<TxRow label={t("landing-demo-tx")} amount="+$250.00" />
					<TxRow label={t("landing-demo-tx")} amount="+$80.00" muted />
				</div>
			</div>
		</div>
	)
}

export function Hero() {
	const { t } = useTranslation()

	return (
		<section className="relative overflow-hidden bg-landing-bg max-md:flex max-md:min-h-[50vh] max-md:flex-col max-md:justify-center">
			<div
				className="landing-container relative z-[1] grid w-full items-center gap-8 pb-8 pt-8 sm:gap-10 md:gap-16 md:pb-4 md:pt-16 lg:grid-cols-[1.05fr_0.95fr]"
			>
				{/* Copy */}
				<div>
					<h1 className="font-display text-[2.25rem] font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl md:text-6xl">
						<MaskReveal>
							{t("landing-hero-title")} <span className="text-brand">{t("landing-hero-accent")}.</span>
						</MaskReveal>
					</h1>
					<RevealStagger>
					<RevealItem>
						<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
							{t("landing-hero-subtitle")}
						</p>
					</RevealItem>
					<RevealItem>
						<div className="mt-6 flex w-full flex-col gap-2.5 sm:mt-8 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
							<Button
								asChild
								size="lg"
								className="w-full rounded-full bg-brand px-7 font-semibold text-[#06120b] transition-colors hover:bg-brand-strong sm:w-auto"
							>
								<Link href="/onboarding">{t("landing-open-account")}</Link>
							</Button>
							<Button
								asChild
								size="lg"
								variant="outline"
								className="w-full rounded-full border-landing-hairline px-7 sm:w-auto"
							>
								<a href="#how-it-works">{t("landing-hero-cta-secondary")}</a>
							</Button>
						</div>
					</RevealItem>
					</RevealStagger>
				</div>

				{/* Signature demo — desktop only */}
				<Reveal delay={0.2} direction="right" className="hidden w-full justify-self-center md:block md:max-w-sm lg:justify-self-end">
					<DemoCard />
				</Reveal>
			</div>
		</section>
	)
}
