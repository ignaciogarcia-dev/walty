"use client"
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react"

/** Legacy onboarding persistence key (no longer written); dashboard removes it on load. */
export const ONBOARDING_LEGACY_STORAGE_KEY = "__walty_onboarding"

type OnboardingState = {
  mnemonic: string | null
  address: string | null
}

type OnboardingCtx = OnboardingState & {
  setWallet: (data: OnboardingState) => void
  clear: () => void
  /** True after create-pin succeeds — mnemonic was cleared on purpose, not a reload. */
  completed: boolean
  markCompleted: () => void
}

const OnboardingContext = createContext<OnboardingCtx | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  // Mnemonic and address live only in RAM — never persisted to storage.
  // Reload mid-flow loses state; callers redirect back to create-wallet.
  const [state, setState] = useState<OnboardingState>({
    mnemonic: null,
    address: null,
  })
  const [completed, setCompleted] = useState(false)

  const setWallet = useCallback((data: OnboardingState) => {
    setState(data)
  }, [])

  const markCompleted = useCallback(() => {
    setCompleted(true)
  }, [])

  /** Clear onboarding secrets from React state (mnemonic + address). */
  const clear = useCallback(() => {
    setState({ mnemonic: null, address: null })
  }, [])

  return (
    <OnboardingContext.Provider
      value={{ ...state, setWallet, clear, completed, markCompleted }}
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
