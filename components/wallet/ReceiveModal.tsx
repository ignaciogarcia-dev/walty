"use client"
import { useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { getAddress } from "viem"
import { CopySimple, Check } from "@phosphor-icons/react"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { NETWORKS } from "@/lib/networks/networks"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/style"
import { useTranslation } from "@/hooks/useTranslation"

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
	const { t } = useTranslation()
	const [selectedChainId] = useState(NETWORKS[0]?.id ?? 1)
	const [copied, setCopied] = useState(false)

	const network = useMemo(
		() => NETWORKS.find((n) => n.id === selectedChainId),
		[selectedChainId],
	)

	const qrValue = useMemo(
		() => (address ? getAddress(address) : ""),
		[address],
	)

	if (!address) return null

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
			<DialogContent className="max-w-sm rounded-4xl border bg-card p-6 shadow-sm sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{t("receive")}</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col items-center gap-5 py-2">
					{/* Network label (non-interactive) */}
					<div className="flex w-full justify-center">
						<div className="flex items-center gap-2 rounded-xl border bg-background px-4 py-2">
							<span
								className={cn(
									"h-2.5 w-2.5 rounded-full",
									NETWORK_COLORS[selectedChainId] ?? "bg-gray-400",
								)}
							/>
							<span className="text-sm font-medium">
								{network?.name ?? "Network"}
							</span>
						</div>
					</div>

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
							{copied ? t("copied") : t("copy-address")}
						</Button>

						<p className="text-xs text-muted-foreground">
							{t("send-only-usdc")}
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
