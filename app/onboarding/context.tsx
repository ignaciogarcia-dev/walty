"use client"
import { createContext, useContext, useState } from "react"

type OnboardingCtx = {
  mnemonic: string | null
  address: string | null
  setWallet: (mnemonic: string, address: string) => void
  clearWallet: () => void
}

const OnboardingContext = createContext<OnboardingCtx | null>(null)

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)

  return (
    <OnboardingContext.Provider value={{
      mnemonic,
      address,
      setWallet: (m, a) => { setMnemonic(m); setAddress(a) },
      clearWallet: () => { setMnemonic(null); setAddress(null) },
    }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error("useOnboarding must be inside OnboardingProvider")
  return ctx
}
