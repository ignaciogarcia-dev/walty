"use client"
import { GithubStars } from "@/components/landing/github-stars"
import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/components/locale/locale-switcher"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { useTranslation } from "@/hooks/useTranslation"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowRightIcon } from "@phosphor-icons/react"

function NavContent() {
	return (
		<>
			<Link href="/" className="flex items-center gap-2">
				<span className="font-bold">WALTY</span>
			</Link>
			<div className="flex items-center gap-1">
				<LocaleSwitcher />
				<ThemeToggle />
				<GithubStars />
				<Button asChild className="rounded-full">
					<Link href="/login">
						<ArrowRightIcon className="size-4" />
					</Link>
				</Button>
			</div>
		</>
	)
}

export function Header() {
	const { t } = useTranslation()
	const staticRef = useRef<HTMLElement>(null)
	const [showSticky, setShowSticky] = useState(false)

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => setShowSticky(!entry.isIntersecting),
			{ threshold: 0 }
		)
		if (staticRef.current) observer.observe(staticRef.current)
		return () => observer.disconnect()
	}, [])

	return (
		<>
			{/* Static header — part of the page flow */}
			<header ref={staticRef} className="w-full">
				<div className="container mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
					<NavContent />
				</div>
			</header>

			{/* Sticky floating header — appears when static one leaves viewport */}
			<header
				className={`fixed top-4 right-8 z-50 flex justify-end transition-all duration-500 ${showSticky ? "pointer-events-auto" : "pointer-events-none"}`}
				style={{ transform: showSticky ? "translateY(0)" : "translateY(-2000px)" }}
			>
				<div className="flex h-18 max-w-screen-lg items-center justify-between rounded-full bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/100 mx-4">
					<Button asChild className="rounded-full px-8 py-4">
						<Link href="/login">{t("landing-get-started")}</Link>
					</Button>
				</div>
			</header>
		</>
	)
}
