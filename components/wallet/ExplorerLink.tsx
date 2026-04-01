import { getTxUrl } from "@/lib/explorer/getTxUrl"

export function ExplorerLink({ hash, chainId = 1 }: { hash: string; chainId?: number }) {
	return (
		<a
			href={getTxUrl(hash, chainId)}
			target="_blank"
			rel="noopener noreferrer"
			className="font-mono text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground break-all"
		>
			{hash.slice(0, 12)}…{hash.slice(-8)} ↗
		</a>
	)
}
