"use client"
import { useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { getAddress } from "viem"
import { CaretDown, CopySimple, Check } from "@phosphor-icons/react"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { NETWORKS } from "@/lib/networks/networks"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/style"

const NETWORK_COLORS: Record<number, string> = {
	1: "bg-gray-400",       // Ethereum
	42161: "bg-blue-500",   // Arbitrum
	8453: "bg-blue-600",    // Base
	10: "bg-red-500",       // Optimism
	137: "bg-purple-500",   // Polygon
}

function truncateAddress(addr: string) {
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function fallbackCopy(text: string) {
	const textarea = document.createElement("textarea")
	textarea.value = text
	textarea.style.position = "fixed"
	textarea.style.opacity = "0"
	document.body.appendChild(textarea)
	textarea.focus()
	textarea.select()
	document.execCommand("copy")
	document.body.removeChild(textarea)
}

type ReceiveModalProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	address: string
}

export function ReceiveModal({ open, onOpenChange, address }: ReceiveModalProps) {
	if (!address) return null

	const [selectedChainId, setSelectedChainId] = useState(1)
	const [copied, setCopied] = useState(false)

	const network = useMemo(
		() => NETWORKS.find((n) => n.id === selectedChainId),
		[selectedChainId],
	)

	const qrValue = useMemo(
		() => `ethereum:${address}@${selectedChainId}`,
		[address, selectedChainId],
	)

	const handleCopy = async () => {
		const checksummed = getAddress(address)
		try {
			await navigator.clipboard.writeText(checksummed)
		} catch {
			fallbackCopy(checksummed)
		}
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm rounded-4xl border bg-card p-6 shadow-sm">
				<DialogHeader>
					<DialogTitle>Receive</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col items-center gap-5 py-2">
					{/* Network selector */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" className="flex items-center gap-2 rounded-xl px-4">
								<span
									className={cn(
										"h-2.5 w-2.5 rounded-full",
										NETWORK_COLORS[selectedChainId] ?? "bg-gray-400",
									)}
								/>
								{network?.name ?? "Network"}
								<CaretDown className="h-3.5 w-3.5 opacity-60" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="center">
							<DropdownMenuRadioGroup
								value={String(selectedChainId)}
								onValueChange={(v) => setSelectedChainId(Number(v))}
							>
								{NETWORKS.map((n) => (
									<DropdownMenuRadioItem key={n.id} value={String(n.id)}>
										<span
											className={cn(
												"mr-2 h-2.5 w-2.5 rounded-full",
												NETWORK_COLORS[n.id] ?? "bg-gray-400",
											)}
										/>
										{n.name}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					{/* QR code */}
					<div className="rounded-2xl border bg-white p-4 shadow-xs">
						<QRCodeSVG value={qrValue} size={200} level="M" includeMargin={false} />
					</div>

					{/* Address + copy */}
					<div className="flex w-full flex-col items-center gap-3 rounded-2xl border bg-secondary/20 p-4">
						<span className="font-mono text-sm text-muted-foreground">
							{truncateAddress(address)}
						</span>
						<Button
							variant="outline"
							className="flex items-center gap-2 rounded-xl"
							onClick={handleCopy}
						>
							{copied ? (
								<Check className="h-4 w-4 text-green-500" />
							) : (
								<CopySimple className="h-4 w-4" />
							)}
							{copied ? "Copied!" : "Copy Address"}
						</Button>

						{network && (
							<p className="text-xs text-muted-foreground">
								Send only on <span className="font-medium">{network.name}</span>
							</p>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
