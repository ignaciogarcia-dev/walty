"use client"
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react"
import { zeroize } from "@/lib/zeroize"

/** Legacy onboarding persistence key (no longer written); dashboard removes it on load. */
export const ONBOARDING_LEGACY_STORAGE_KEY = "__walty_onboarding"

/** DKG output held in RAM across the MPC onboarding steps (create-wallet → recovery-kit → create-pin). */
export type OnboardingMpc = {
  keyId: string
  deviceShareBytes: Uint8Array
  /** Nulled once the recovery kit is exported + verified. */
  backupShareBytes: Uint8Array | null
  pubkey: string
  address: string
  /** DKLS polynomial generation (= mpc_keys.version) for the kit being exported. */
  generation: number
  /**
   * Ack-then-commit token from /mpc-recover (recovery flow only). The server
   * holds the advanced share staged until create-pin calls /mpc-recover/commit,
   * after the new device share is saved and the new kit downloaded.
   */
  recoverToken?: string
}

type OnboardingState = {
  address: string | null
  mpc: OnboardingMpc | null
}

type OnboardingCtx = OnboardingState & {
  setMpc: (mpc: OnboardingMpc) => void
  clear: () => void
  /** True after create-pin succeeds — secrets were cleared on purpose, not a reload. */
  completed: boolean
  markCompleted: () => void
}

const OnboardingContext = createContext<OnboardingCtx | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  // MPC shares live only in RAM — never persisted until the PIN step.
  // Reload mid-flow loses state; callers redirect back to create-wallet.
  const [state, setState] = useState<OnboardingState>({
    address: null,
    mpc: null,
  })
  const [completed, setCompleted] = useState(false)

  const setMpc = useCallback((mpc: OnboardingMpc) => {
    setState((prev) => ({ ...prev, mpc, address: mpc.address }))
  }, [])

  const markCompleted = useCallback(() => {
    setCompleted(true)
  }, [])

  /** Clear onboarding secrets from React state, zeroizing any held MPC share bytes. */
  const clear = useCallback(() => {
    setState((prev) => {
      if (prev.mpc) {
        zeroize(prev.mpc.deviceShareBytes)
        if (prev.mpc.backupShareBytes) zeroize(prev.mpc.backupShareBytes)
      }
      return { address: null, mpc: null }
    })
  }, [])

  return (
    <OnboardingContext.Provider
      value={{ ...state, setMpc, clear, completed, markCompleted }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider")
  return ctx
}
