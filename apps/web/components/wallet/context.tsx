"use client"
import { createContext, useContext } from "react"
import { useWallet } from "@/hooks/useWallet"

type WalletState = ReturnType<typeof useWallet>

export const WalletContext = createContext<WalletState | null>(null)

export function useWalletContext(): WalletState {
	const ctx = useContext(WalletContext)
	if (!ctx) throw new Error("useWalletContext must be used inside WalletContext.Provider")
	return ctx
}
