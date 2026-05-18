"use client"

import { useCallback, useRef, useState } from "react"
import { UnlockDialog } from "@/components/wallet/UnlockDialog"
import { useWalletContext } from "@/components/wallet/context"

/**
 * Reusable unlock flow.
 *
 * Returns:
 * - `ensureUnlocked()` — async, resolves `true` if wallet is unlocked
 *   (either already or after the user enters PIN). Resolves `false` on cancel.
 * - `unlockDialog` — JSX to render (handles its own open/close state).
 *
 * Usage:
 * ```tsx
 * const { ensureUnlocked, unlockDialog } = useUnlockFlow()
 *
 * async function handleSign() {
 *   if (!await ensureUnlocked()) return
 *   await signAndBroadcastIntent(intentId)
 * }
 *
 * return <>{unlockDialog}</>
 * ```
 */
export function useUnlockFlow() {
  const { isRecentlyUnlocked } = useWalletContext()
  const [open, setOpen] = useState(false)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const ensureUnlocked = useCallback((): Promise<boolean> => {
    if (isRecentlyUnlocked()) return Promise.resolve(true)

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOpen(true)
    })
  }, [isRecentlyUnlocked])

  function handleResult(success: boolean) {
    setOpen(false)
    resolverRef.current?.(success)
    resolverRef.current = null
  }

  const unlockDialog = <UnlockDialog open={open} onResult={handleResult} />

  return { ensureUnlocked, unlockDialog }
}
