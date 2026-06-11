"use client"
import { GithubStars } from "@/components/landing/github-stars"
import { WaltyLogo } from "@/components/landing/WaltyLogo"
import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/components/locale/locale-switcher"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { useTranslation } from "@/hooks/useTranslation"
import { cn } from "@/lib/utils"
import { ArrowRightIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useEffect, useState } from "react"

export function Header() {
	const { t } = useTranslation()
	const [scrolled, setScrolled] = useState(false)

	useEffect(() => {
		const handle = () => setScrolled(window.scrollY > 24)
		handle()
		window.addEventListener("scroll", handle, { passive: true })
		return () => window.removeEventListener("scroll", handle)
	}, [])

	return (
		<header
			className={cn(
				"pointer-events-none fixed inset-x-0 z-50 transition-[top] duration-300 ease-out",
				scrolled ? "top-3" : "top-0",
			)}
		>
			<div className="landing-container">
				<div
					className={cn(
						"pointer-events-auto flex w-full items-center justify-between gap-8 transition-all duration-300 ease-out",
						scrolled
							? "h-14 rounded-full border border-landing-hairline bg-landing-bg/80 px-5 shadow-sm backdrop-blur-lg"
							: "h-16 border-0 bg-landing-bg/40 backdrop-blur-sm",
					)}
				>
					<div className="flex items-center gap-8">
						<Link href="/" aria-label="Walty" className="flex items-center">
							<WaltyLogo size={32} priority className="size-8" />
						</Link>
						<nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
							<a href="#features" className="transition-colors hover:text-foreground">
								{t("landing-nav-product")}
							</a>
							<a href="#security" className="transition-colors hover:text-foreground">
								{t("landing-nav-security")}
							</a>
							<a
								href="https://github.com/ignaciogarcia-dev/walty/tree/main/docs"
								target="_blank"
								rel="noopener noreferrer"
								className="transition-colors hover:text-foreground"
							>
								{t("landing-docs")}
							</a>
						</nav>
					</div>
					<div className="flex items-center gap-1">
						<LocaleSwitcher />
						<ThemeToggle />
						<div className={`transition-all duration-300 ${scrolled ? "hidden lg:block" : "hidden sm:block"}`}>
							<GithubStars />
						</div>
						<Button asChild className="ml-1 rounded-full bg-brand font-semibold text-[#06120b] hover:bg-brand-strong">
							<Link href="/onboarding">
								<span className="hidden sm:inline">{t("landing-open-account")}</span>
								<ArrowRightIcon className="size-4" />
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</header>
	)
}
