"use client"

/**
 * useRelayTransfer
 *
 * Drop-in companion to useWalletTransfer for gasless EIP-2612 permit flows.
 *
 * Flow:
 *   1. User enters amount
 *   2. Hook calculates gross/net/fee breakdown
 *   3. On confirm: signs permit() off-chain (no gas, just a message)
 *   4. Sends permit + params to POST /api/tx/relay
 *   5. Server pays gas and executes the split transfer
 *
 * The user never needs MATIC.
 */

import { useCallback, useState } from "react"
import { parseUnits, formatUnits } from "viem"
import type { Token } from "@/lib/tokens/tokenRegistry"
import type { WalletSecurityManager } from "@/lib/wallet/WalletSecurityManager"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { getWalletClient } from "@/lib/rpc/getWalletClient"
import {
  signPermit,
  calcFeeAmount,
  calcNetAmount,
  calcGrossFromNet,
  supportsPermit,
} from "@/lib/transactions/permit"
import { toast } from "@/hooks/useToast"
import { getTxUrl } from "@/lib/explorer/getTxUrl"
import type { TxStatus } from "@/hooks/useWallet"

// ─── Fee config (client reads NEXT_PUBLIC_ vars for display only) ─────────────

export function getClientFeeConfig(): { feeBps: number; feeRecipient: string } {
  const feeBps       = parseInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "100", 10)
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT ?? ""
  return { feeBps, feeRecipient }
}

// ─── Amount breakdown ─────────────────────────────────────────────────────────

export type AmountBreakdown = {
  /** Raw input from the user */
  inputAmount: string
  /** Mode: "sender" = user typed what they send, "recipient" = user typed what arrives */
  mode: "sender" | "recipient"
  /** What leaves the sender's wallet */
  grossAmount: string
  /** Platform fee */
  feeAmount: string
  /** Fee in basis points */
  feeBps: number
  /** What arrives at the recipient */
  netAmount: string
}

export function calcBreakdown(
  inputAmount: string,
  mode: "sender" | "recipient",
  decimals: number,
  feeBps: number,
): AmountBreakdown | null {
  const parsed = parseFloat(inputAmount)
  if (!inputAmount || isNaN(parsed) || parsed <= 0) return null

  const inputRaw = parseUnits(inputAmount, decimals)

  let grossRaw: bigint
  let netRaw:   bigint
  let feeRaw:   bigint

  if (mode === "sender") {
    grossRaw = inputRaw
    feeRaw   = calcFeeAmount(grossRaw, feeBps)
    netRaw   = calcNetAmount(grossRaw, feeBps)
  } else {
    // recipient mode: user wants recipient to get exactly X
    netRaw   = inputRaw
    grossRaw = calcGrossFromNet(netRaw, feeBps)
    feeRaw   = grossRaw - netRaw
  }

  return {
    inputAmount,
    mode,
    grossAmount: formatUnits(grossRaw, decimals),
    feeAmount:   formatUnits(feeRaw,   decimals),
    netAmount:   formatUnits(netRaw,   decimals),
    feeBps,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseRelayTransferResult {
  txStatus: TxStatus
  txHash:   string | null
  txError:  string | null
  executeRelayTransfer: (params: {
    token:       Token
    to:          string
    grossAmount: string
    chainId:     number
  }) => Promise<void>
  resetTx: () => void
}

export function useRelayTransfer(
  address:        string | null,
  security:       WalletSecurityManager,
  loadTxHistory:  () => Promise<void>,
  loadBalance:    (addr: string) => Promise<void>,
): UseRelayTransferResult {
  const [txStatus, setTxStatus] = useState<TxStatus>("idle")
  const [txHash,   setTxHash]   = useState<string | null>(null)
  const [txError,  setTxError]  = useState<string | null>(null)

  const resetTx = useCallback(() => {
    setTxStatus("idle")
    setTxHash(null)
    setTxError(null)
  }, [])

  const executeRelayTransfer = useCallback(async (params: {
    token:       Token
    to:          string
    grossAmount: string
    chainId:     number
  }) => {
    if (!address) {
      setTxStatus("error")
      setTxError("Wallet locked")
      return
    }

    setTxStatus("pending")
    setTxHash(null)
    setTxError(null)

    try {
      const { token, to, grossAmount, chainId } = params
      const decimals = token.decimals
      const grossRaw = parseUnits(grossAmount, decimals)

      const sponsorAddress = process.env.NEXT_PUBLIC_SPONSOR_ADDRESS as `0x${string}`
      if (!sponsorAddress) throw new Error("NEXT_PUBLIC_SPONSOR_ADDRESS not set")

      if (!token.address) throw new Error("Token has no contract address")

      // ── 1. Verify token supports EIP-2612 permit ───────────────────────────
      const publicClientCheck = getPublicClient(chainId)
      const hasPermit = await supportsPermit(token.address as `0x${string}`, publicClientCheck)
      if (!hasPermit) {
        throw new Error(`${token.symbol} no soporta transferencias gasless en esta red. Usá USDC en Polygon.`)
      }

      // ── 2. Sign permit off-chain (no gas) ──────────────────────────────────
      let permitSig: Awaited<ReturnType<typeof signPermit>>

      await security.withUnlockedSeed(async (mnemonic) => {
        const walletClient = getWalletClient(mnemonic, chainId)
        const publicClient = getPublicClient(chainId)

        permitSig = await signPermit({
          walletClient,
          publicClient,
          tokenAddress:    token.address as `0x${string}`,
          tokenName:       token.name,
          chainId,
          owner:           address as `0x${string}`,
          spender:         sponsorAddress,
          value:           grossRaw,
          deadlineSeconds: 1200, // 20 minutes
        })
      })

      // ── 2. Send to relay endpoint ───────────────────────────────────────────
      const res = await fetch("/api/tx/relay", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenAddress: token.address,
          decimals:     token.decimals,
          chainId,
          grossAmount,
          recipient:    to,
          permit: {
            owner:    address,
            spender:  sponsorAddress,
            value:    grossRaw.toString(),
            deadline: permitSig!.deadline.toString(),
            nonce:    permitSig!.nonce.toString(),
            v:        permitSig!.v,
            r:        permitSig!.r,
            s:        permitSig!.s,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Relay failed" }))
        throw new Error(body.error ?? "Relay request failed")
      }

      const { data } = await res.json()

      setTxHash(data.transferHash)
      setTxStatus("confirmed")

      toast.success("Transaction confirmed", {
        description: `${data.netAmount} ${token.symbol} sent`,
        href: getTxUrl(data.transferHash, chainId),
      })

      loadTxHistory().catch(() => {})
      if (address) loadBalance(address)

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setTxStatus("error")
      setTxError(msg)
      toast.error("Failed to send", { description: msg })
    }
  }, [address, security, loadTxHistory, loadBalance])

  return {
    txStatus,
    txHash,
    txError,
    executeRelayTransfer,
    resetTx,
  }
}
