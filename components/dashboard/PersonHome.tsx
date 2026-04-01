"use client"
import { useState } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { BalanceCard } from "@/components/wallet/BalanceCard"
import { ReceiveModal } from "@/components/wallet/ReceiveModal"
import { ArrowDownRight, PaperPlaneTilt, MoneyIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { WalletActivityFeed } from "@/components/dashboard/WalletActivityFeed"
import { useRouter } from "next/navigation"
import { useTranslation } from "@/hooks/useTranslation"

export function PersonHome() {
	const { address } = useWalletContext()
	const router = useRouter()
	const [receiveOpen, setReceiveOpen] = useState(false)
	const { t } = useTranslation()

	const quickActionClassName =
		"flex-1 cursor-pointer rounded-2xl border border-quick-action-border bg-quick-action-surface text-quick-action-foreground backdrop-blur-md transition-all hover:border-quick-action-hover-border hover:bg-quick-action-hover"

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<BalanceCard address={address} />

			<div className="flex gap-3">
				<Button onClick={() => router.push("/dashboard/pay")} variant="ghost" className={quickActionClassName} size="lg">
					<MoneyIcon className="mr-2 h-4 w-4" />
					{t("pay")}
				</Button>
				<Button onClick={() => setReceiveOpen(true)} variant="ghost" className={quickActionClassName} size="lg">
					<ArrowDownRight className="mr-2 h-4 w-4" />
					{t("receive")}
				</Button>
				<Button onClick={() => router.push("/dashboard/send")} variant="ghost" className={quickActionClassName} size="lg">
					<PaperPlaneTilt className="mr-2 h-4 w-4" />
					{t("transfer")}
				</Button>
			</div>

			{address && <ReceiveModal open={receiveOpen} onOpenChange={setReceiveOpen} address={address} />}

			<WalletActivityFeed />
		</div>
	)
}
