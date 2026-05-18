"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWalletContext } from "@/components/wallet/context"
import { useTranslation } from "@/hooks/useTranslation"
import {
  canAttemptUnlock,
  recordFailedAttempt,
  resetUnlockGuard,
} from "@/lib/unlock-guard"

type UnlockDialogProps = {
  open: boolean
  onResult: (success: boolean) => void
}

/**
 * Pure UI dialog for PIN entry.
 * Reports success/cancel via `onResult(boolean)` — no business logic.
 */
export function UnlockDialog({ open, onResult }: UnlockDialogProps) {
  const { t } = useTranslation()
  const { unlock } = useWalletContext()
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lockoutRemaining, setLockoutRemaining] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPin("")
      setError(null)
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (lockoutRemaining <= 0) return
    const id = setInterval(() => {
      setLockoutRemaining((prev) => {
        const next = prev - 1000
        return next <= 0 ? 0 : next
      })
    }, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockoutRemaining > 0])

  async function handleUnlock() {
    const guard = canAttemptUnlock()
    if (!guard.allowed) {
      setLockoutRemaining(guard.remainingMs)
      setError(t("unlock-locked-out").replace("{seconds}", String(Math.ceil(guard.remainingMs / 1000))))
      return
    }

    setLoading(true)
    setError(null)

    try {
      await unlock(pin)
      resetUnlockGuard()
      setPin("")
      onResult(true)
    } catch {
      const result = recordFailedAttempt()
      if (result.locked) {
        setLockoutRemaining(result.lockoutMs)
        setError(t("unlock-locked-out").replace("{seconds}", String(Math.ceil(result.lockoutMs / 1000))))
      } else {
        setError(t("wrong-password"))
      }
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) onResult(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm rounded-4xl border bg-card p-6 shadow-sm sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("unlock-to-sign")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("unlock-to-sign-desc")}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unlock-dialog-pin">{t("wallet-password")}</Label>
            <Input
              ref={inputRef}
              id="unlock-dialog-pin"
              type="password"
              inputMode="numeric"
              placeholder="······"
              maxLength={8}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); if (error) setError(null) }}
              onKeyDown={(e) => e.key === "Enter" && pin && handleUnlock()}
              autoComplete="current-password"
              className="rounded-xl"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button
            onClick={handleUnlock}
            disabled={!pin || loading || lockoutRemaining > 0}
            className="w-full rounded-xl"
          >
            {lockoutRemaining > 0
              ? t("unlock-locked-out").replace("{seconds}", String(Math.ceil(lockoutRemaining / 1000)))
              : loading
                ? t("unlocking")
                : t("unlock")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
