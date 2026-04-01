const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000 // 1 minute
const STORAGE_KEY = "walty_unlock_guard"

type UnlockGuardState = {
  attempts: number
  lockedUntil: number | null
}

function load(): UnlockGuardState {
  if (typeof window === "undefined") return { attempts: 0, lockedUntil: null }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { attempts: 0, lockedUntil: null }
    return JSON.parse(raw) as UnlockGuardState
  } catch {
    return { attempts: 0, lockedUntil: null }
  }
}

function save(state: UnlockGuardState) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** Returns `{ allowed: true }` if unlock is allowed, or `{ allowed: false, remainingMs }` if locked out. */
export function canAttemptUnlock(): { allowed: true } | { allowed: false; remainingMs: number } {
  const state = load()

  if (state.lockedUntil) {
    const remaining = state.lockedUntil - Date.now()
    if (remaining > 0) {
      return { allowed: false, remainingMs: remaining }
    }
    // Lockout expired — reset
    save({ attempts: 0, lockedUntil: null })
  }

  return { allowed: true }
}

/** Record a failed unlock attempt. Returns the new guard state for UI feedback. */
export function recordFailedAttempt(): { locked: boolean; attemptsLeft: number; lockoutMs: number } {
  const state = load()

  state.attempts += 1

  if (state.attempts >= MAX_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOCKOUT_MS
    save(state)
    return { locked: true, attemptsLeft: 0, lockoutMs: LOCKOUT_MS }
  }

  save(state)
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - state.attempts, lockoutMs: 0 }
}

/** Reset after a successful unlock. */
export function resetUnlockGuard() {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}
