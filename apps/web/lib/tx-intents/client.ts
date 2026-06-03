"use client"

import type { TxIntentPayload, TxIntent, TxIntentType } from "@walty/shared/tx-intents/types"
import { unwrap } from "@/lib/api/unwrap"

/**
 * Client-side helpers for the tx-intent flow.
 * Stateless — each function does one API call and returns the result.
 */

export async function createTxIntent(
  payload: TxIntentPayload,
  idempotencyKey?: string,
  type: TxIntentType = "transfer",
): Promise<TxIntent> {
  const res = await fetch("/api/tx-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, idempotencyKey, type }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? "Failed to create tx intent")
  }
  return unwrap<TxIntent>(await res.json())
}

export async function signTxIntent(
  intentId: string,
  signedRaw: string
): Promise<TxIntent> {
  const res = await fetch(`/api/tx-intents/${intentId}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedRaw }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? "Failed to sign tx intent")
  }
  return unwrap<TxIntent>(await res.json())
}

export async function broadcastTxIntent(
  intentId: string
): Promise<TxIntent> {
  const res = await fetch(`/api/tx-intents/${intentId}/broadcast`, {
    method: "POST",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? "Failed to broadcast tx intent")
  }
  return unwrap<TxIntent>(await res.json())
}

export async function confirmTxIntent(
  intentId: string,
  status: "confirmed" | "failed"
): Promise<TxIntent> {
  const res = await fetch(`/api/tx-intents/${intentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? "Failed to confirm tx intent")
  }
  return unwrap<TxIntent>(await res.json())
}

export async function getTxIntent(intentId: string): Promise<TxIntent> {
  const res = await fetch(`/api/tx-intents/${intentId}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? "Failed to fetch tx intent")
  }
  return unwrap<TxIntent>(await res.json())
}

/** After a failed broadcast, resets intent to pending so the user can sign again. */
export async function retryFailedTxIntent(intentId: string): Promise<TxIntent> {
  const res = await fetch(`/api/tx-intents/${intentId}/retry`, {
    method: "POST",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? "Failed to reset tx intent")
  }
  return unwrap<TxIntent>(await res.json())
}
