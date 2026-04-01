"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslation } from "@/hooks/useTranslation"

interface LockScreenProps {
  onUnlock: (pin: string) => Promise<void>
}

interface LockScreenState {
  attempts: number
  lockedUntil: number | null
  pinInput: string
  error: string | null
  isUnlocking: boolean
}

const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 60_000

export function LockScreen({ onUnlock }: LockScreenProps) {
  const { t } = useTranslation()

  const [state, setState] = useState<LockScreenState>({
    attempts: 0,
    lockedUntil: null,
    pinInput: "",
    error: null,
    isUnlocking: false,
  })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!state.lockedUntil) return

    const timer = setInterval(() => {
      const ts = Date.now()
      setNow(ts)
      setState((prev) => {
        if (ts >= prev.lockedUntil!) {
          return { ...prev, lockedUntil: null, attempts: 0 }
        }
        return prev
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [state.lockedUntil])

  const isLocked = state.lockedUntil !== null && now < state.lockedUntil
  const remainingSeconds = isLocked
    ? Math.ceil((state.lockedUntil! - now) / 1000)
    : 0

  const handleUnlock = async () => {
    if (!state.pinInput || isLocked || state.isUnlocking) return

    setState((prev) => ({ ...prev, isUnlocking: true, error: null }))

    try {
      await onUnlock(state.pinInput)
      setState({
        attempts: 0,
        lockedUntil: null,
        pinInput: "",
        error: null,
        isUnlocking: false,
      })
    } catch {
      const newAttempts = state.attempts + 1
      if (newAttempts >= MAX_ATTEMPTS) {
        setState((prev) => ({
          ...prev,
          attempts: newAttempts,
          lockedUntil: Date.now() + LOCKOUT_DURATION_MS,
          error: null,
          pinInput: "",
          isUnlocking: false,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          attempts: newAttempts,
          error: `${t("wrong-password")} (${MAX_ATTEMPTS - newAttempts} ${t("attempts-remaining")})`,
          pinInput: "",
          isUnlocking: false,
        }))
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm rounded-4xl">
        <CardHeader>
          <CardTitle>{t("wallet-locked")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("wallet-locked-description")}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* PIN Input */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unlock-pin">{t("wallet-password")}</Label>
            <Input
              id="unlock-pin"
              type="password"
              inputMode="numeric"
              placeholder="······"
              maxLength={8}
              value={state.pinInput}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  pinInput: e.target.value.replace(/\D/g, ""),
                  error: null,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && state.pinInput) handleUnlock()
              }}
              disabled={!!isLocked || state.isUnlocking}
              autoComplete="current-password"
              className="rounded-xl"
              autoFocus
            />
          </div>

          {/* Error Message */}
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}

          {/* Lockout Timer */}
          {isLocked && (
            <p className="text-xs text-muted-foreground text-center">
              {t("unlock-locked-out").replace("{seconds}", String(remainingSeconds))}
            </p>
          )}

          {/* Unlock Button */}
          <Button
            onClick={handleUnlock}
            disabled={!!isLocked || !state.pinInput || state.isUnlocking}
            className="w-full rounded-xl"
          >
            {isLocked
              ? t("unlock-locked-out").replace("{seconds}", String(remainingSeconds))
              : t("unlock")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
