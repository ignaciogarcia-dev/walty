"use client"

import { Github } from "lucide-react"
import { useEffect, useState } from "react"

const DEFAULT_OWNER = "ignaciogarcia-dev"
const DEFAULT_REPO = "walty"

function formatStarCount(n: number): string {
	if (n >= 1_000_000) {
		const m = n / 1_000_000
		return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
	}
	if (n >= 1000) {
		const k = n / 1000
		return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
	}
	return String(n)
}

type GithubStarsProps = {
	owner?: string
	repo?: string
	className?: string
}

export function GithubStars({
	owner = DEFAULT_OWNER,
	repo = DEFAULT_REPO,
	className,
}: GithubStarsProps) {
	const [count, setCount] = useState<number | null>(null)

	useEffect(() => {
		const ac = new AbortController()
		const url = `https://api.github.com/repos/${owner}/${repo}`

		fetch(url, {
			signal: ac.signal,
			headers: { Accept: "application/vnd.github+json" },
		})
			.then((res) => (res.ok ? res.json() : Promise.reject()))
			.then((data: { stargazers_count?: number }) => {
				if (typeof data.stargazers_count === "number") {
					setCount(data.stargazers_count)
				}
			})
			.catch(() => {})

		return () => ac.abort()
	}, [owner, repo])

	const href = `https://github.com/${owner}/${repo}`
	const label = count === null ? "…" : formatStarCount(count)

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={`inline-flex h-9 items-center gap-2 rounded-full border border-border bg-transparent px-3 text-sm tabular-nums transition-colors duration-150 hover:bg-secondary/40 ${className ?? ""}`}
			aria-label={`GitHub repository stars: ${count === null ? "loading" : label}`}
		>
			<Github className="size-4 shrink-0 text-muted-foreground" aria-hidden />
			<span className="text-muted-foreground">Stars</span>
			<span className="font-medium text-foreground">{label}</span>
		</a>
	)
}
