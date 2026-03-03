const EXPLORER_BASE = "https://sepolia.etherscan.io/tx"

export function ExplorerLink({ hash }: { hash: string }) {
	return (
		<a
			href={`${EXPLORER_BASE}/${hash}`}
			target="_blank"
			rel="noopener noreferrer"
			className="font-mono text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground break-all"
		>
			{hash.slice(0, 12)}…{hash.slice(-8)} ↗
		</a>
	)
}
