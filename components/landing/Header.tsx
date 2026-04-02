"use client"
import { GithubStars } from "@/components/landing/github-stars"
import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/components/locale/locale-switcher"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import Link from "next/link"
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
	return (
		<header className="w-full">
			<div className="container mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
				<NavContent />
			</div>
		</header>
	)
}
