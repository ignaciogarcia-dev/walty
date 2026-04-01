"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "next/navigation"
import { useTranslation } from "@/hooks/useTranslation"
import type { PaymentRequestHistoryItem } from "@/lib/activity/types"

type Step = "select" | "form" | "success"

export function RefundRequestPage() {
	const { t } = useTranslation()
	const router = useRouter()
	const [step, setStep] = useState<Step>("select")
	const [selected, setSelected] = useState<PaymentRequestHistoryItem | null>(null)
	const [reason, setReason] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Reuses the BusinessActivityList cache if the user
	// already visited the activity screen with the "paid" filter.
	const { data: payments = [], isLoading: loading } = useQuery({
		queryKey: ["payment-requests-history", "paid"],
		queryFn: async () => {
			const res = await fetch("/api/payment-requests/history?status=paid&limit=50")
			if (!res.ok) throw new Error("Failed to load")
			const { data } = await res.json()
			return data.items as PaymentRequestHistoryItem[]
		},
		staleTime: 60_000,
	})

	function handleSelect(payment: PaymentRequestHistoryItem) {
		setSelected(payment)
		setReason("")
		setStep("form")
	}

	async function handleSubmit() {
		if (!selected) return
		setError(null)
		setSubmitting(true)
		try {
			const res = await fetch("/api/business/refund-requests", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					paymentRequestId: selected.id,
					destinationAddress: selected.payerAddress ?? "",
					reason: reason.trim(),
				}),
			})
			if (!res.ok) {
				const data = await res.json()
				setError(data.error ?? t("error-submitting-request"))
				return
			}
			setStep("success")
		} catch {
			setError(t("connection-error"))
		} finally {
			setSubmitting(false)
		}
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-10 flex items-center justify-center">
				<Spinner className="size-6" />
			</div>
		)
	}

	if (step === "success") {
		return (
			<div className="mx-auto max-w-md px-4 py-10 flex flex-col items-center gap-4 text-center">
				<h2 className="text-lg font-semibold">{t("refund-request-sent")}</h2>
				<p className="text-sm text-muted-foreground">{t("refund-request-sent-desc")}</p>
				<Button onClick={() => router.push("/dashboard/business/home")} className="rounded-xl">
					{t("back-to-home")}
				</Button>
			</div>
		)
	}

	if (step === "form" && selected) {
		return (
			<div className="mx-auto max-w-md px-4 py-10 flex flex-col gap-6">
				<button
					type="button"
					onClick={() => { setStep("select"); setError(null) }}
					className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
				>
					<ArrowLeft className="h-4 w-4" />
					{t("back")}
				</button>
				<div>
					<h2 className="text-lg font-semibold">{t("request-refund")}</h2>
					<p className="text-sm text-muted-foreground mt-1">
						${selected.amountUsd} {selected.tokenSymbol} —{" "}
						{new Date(selected.paidAt ?? selected.createdAt).toLocaleDateString(undefined)}
					</p>
				</div>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label>{t("refund-destination-address")}</Label>
						<p className="rounded-xl border border-border bg-muted px-3 py-2 font-mono text-sm break-all">
							{selected.payerAddress ?? "—"}
						</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="reason">{t("refund-reason")}</Label>
						<Input
							id="reason"
							placeholder={t("refund-reason-placeholder")}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							className="rounded-xl"
						/>
					</div>
					{error && <p className="text-xs text-destructive">{error}</p>}
					<Button
						onClick={handleSubmit}
						disabled={submitting || !selected.payerAddress || !reason.trim()}
						className="w-full rounded-xl"
					>
						{submitting ? t("submitting") : t("submit-request")}
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<button
				type="button"
				onClick={() => router.push("/dashboard/business/home")}
				className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
			>
				<ArrowLeft className="h-4 w-4" />
				{t("back")}
			</button>
			<h2 className="text-lg font-semibold">{t("select-payment-for-refund")}</h2>
			{payments.length === 0 ? (
				<p className="text-sm text-muted-foreground text-center py-8">{t("no-paid-payments")}</p>
			) : (
				<div className="flex flex-col gap-3">
					{payments.map((p) => (
						<button
							key={p.id}
							type="button"
							onClick={() => handleSelect(p)}
							className="rounded-xl border border-border bg-card p-4 flex items-center justify-between hover:border-primary/30 transition-colors text-left"
						>
							<div>
								<span className="text-sm font-medium">${p.amountUsd} {p.tokenSymbol}</span>
								<span className="block text-xs text-muted-foreground mt-0.5">
									{new Date(p.paidAt ?? p.createdAt).toLocaleDateString(undefined)}
								</span>
							</div>
							<span className="text-xs text-muted-foreground">
								{p.txHash ? `${p.txHash.slice(0, 6)}...${p.txHash.slice(-4)}` : ""}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	)
}