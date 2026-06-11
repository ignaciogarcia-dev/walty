import { cn } from "@/lib/utils"
import Image from "next/image"

type WaltyLogoProps = {
	className?: string
	size?: number
	priority?: boolean
}

export function WaltyLogo({ className, size = 28, priority }: WaltyLogoProps) {
	return (
		<Image
			src="/logo.png"
			alt="Walty"
			width={size}
			height={size}
			priority={priority}
			className={cn("shrink-0", className)}
		/>
	)
}
