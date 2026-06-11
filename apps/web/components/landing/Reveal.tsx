"use client"
import { cn } from "@/lib/utils"
import { animate, motion, useInView, useReducedMotion, type Transition, type Variants } from "motion/react"
import { useEffect, useRef, type ReactNode } from "react"

const VIEWPORT = { once: true, amount: 0.18, margin: "0px 0px -10% 0px" } as const

// Confident settle — value coming to rest, a touch of overshoot.
const settle: Transition = { type: "spring", stiffness: 90, damping: 17, mass: 0.9 }

type Direction = "up" | "left" | "right" | "none"

// Hidden state per entrance direction. Transform + opacity only — both are
// composited by the GPU, so reveals never trigger a per-frame repaint.
function hidden(direction: Direction) {
	switch (direction) {
		case "left":
			return { opacity: 0, x: -32 }
		case "right":
			return { opacity: 0, x: 32 }
		case "none":
			return { opacity: 0 }
		default:
			return { opacity: 0, y: 26 }
	}
}

const shown = { opacity: 1, x: 0, y: 0 }

const staggerVariants: Variants = {
	hidden: {},
	visible: {
		transition: { staggerChildren: 0.1, delayChildren: 0.06 },
	},
}

type RevealProps = {
	children: ReactNode
	delay?: number
	direction?: Direction
	className?: string
}

// Scroll-in reveal when the element enters the viewport. Respects reduced motion.
export function Reveal({ children, delay = 0, direction = "up", className }: RevealProps) {
	const ref = useRef<HTMLDivElement | null>(null)
	const reduced = useReducedMotion()
	const inView = useInView(ref, VIEWPORT)

	// Reduced motion renders the same element/className as the animated branch
	// (just without motion) so layout is identical between the two modes.
	if (reduced) {
		return (
			<div ref={ref} className={className}>
				{children}
			</div>
		)
	}

	return (
		<motion.div
			ref={ref}
			className={className}
			initial={hidden(direction)}
			animate={inView ? { ...shown, transition: { ...settle, delay } } : hidden(direction)}
		>
			{children}
		</motion.div>
	)
}

type RevealStaggerProps = {
	children: ReactNode
	className?: string
}

// Staggered children — each child reveals in sequence when the group enters view.
export function RevealStagger({ children, className }: RevealStaggerProps) {
	const ref = useRef<HTMLDivElement | null>(null)
	const reduced = useReducedMotion()
	const inView = useInView(ref, VIEWPORT)

	if (reduced) {
		return (
			<div ref={ref} className={className}>
				{children}
			</div>
		)
	}

	return (
		<motion.div
			ref={ref}
			className={className}
			initial="hidden"
			animate={inView ? "visible" : "hidden"}
			variants={staggerVariants}
		>
			{children}
		</motion.div>
	)
}

type RevealItemProps = {
	children: ReactNode
	className?: string
	direction?: Direction
}

// Child of RevealStagger — do not use standalone.
export function RevealItem({ children, className, direction = "up" }: RevealItemProps) {
	const reduced = useReducedMotion()

	if (reduced) {
		return <div className={className}>{children}</div>
	}

	return (
		<motion.div
			className={className}
			variants={{ hidden: hidden(direction), visible: { ...shown, transition: settle } }}
		>
			{children}
		</motion.div>
	)
}

type MaskRevealProps = {
	children: ReactNode
	className?: string
	delay?: number
}

// Headline reveal — text rises from behind a clip mask. Wrap heading text only.
export function MaskReveal({ children, className, delay = 0 }: MaskRevealProps) {
	const ref = useRef<HTMLSpanElement | null>(null)
	const reduced = useReducedMotion()
	const inView = useInView(ref, VIEWPORT)

	if (reduced) {
		return (
			<span ref={ref} className={className}>
				{children}
			</span>
		)
	}

	return (
		<span ref={ref} className={cn("block overflow-hidden pb-[0.12em]", className)}>
			<motion.span
				className="block"
				initial={{ y: "120%" }}
				animate={inView ? { y: 0 } : { y: "120%" }}
				transition={{ ...settle, delay }}
			>
				{children}
			</motion.span>
		</span>
	)
}

type CountUpProps = {
	value: number
	decimals?: number
	className?: string
}

// Fixed "en-US" locale keeps SSR and client output identical (no hydration drift).
function formatCount(value: number, decimals: number) {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	})
}

// Counts up from zero to `value` once it scrolls into view. Settles, never loops.
// Writes straight to the DOM node via ref on each frame — no React re-render churn.
export function CountUp({ value, decimals = 2, className }: CountUpProps) {
	const ref = useRef<HTMLSpanElement | null>(null)
	const reduced = useReducedMotion()
	const inView = useInView(ref, { once: true, amount: 0.6 })

	useEffect(() => {
		const node = ref.current
		if (!node) return
		if (reduced) {
			node.textContent = formatCount(value, decimals)
			return
		}
		if (!inView) return
		const controls = animate(0, value, {
			duration: 1.5,
			ease: [0.16, 1, 0.3, 1],
			onUpdate: (v) => {
				node.textContent = formatCount(v, decimals)
			},
		})
		return () => controls.stop()
	}, [inView, value, reduced, decimals])

	return (
		<span ref={ref} className={className}>
			{formatCount(0, decimals)}
		</span>
	)
}
