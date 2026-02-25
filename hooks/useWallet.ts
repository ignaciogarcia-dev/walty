"use client"
import { useState, useEffect } from "react"
import { formatEther } from "viem"
import { createWallet } from "@/lib/wallet"
import { encryptSeed, decryptSeed, EncryptedSeed } from "@/lib/crypto"
import { getBalance } from "@/lib/eth"

type StoredWallet = {
  encrypted: EncryptedSeed
  address: string
}

type PendingWallet = {
  mnemonic: string
  address: string
  encrypted: EncryptedSeed
}

export type WalletStatus = "loading" | "new" | "backup" | "locked" | "unlocked"

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("loading")
  const [seed, setSeed] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingWallet | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("wallet")
    setStatus(stored ? "locked" : "new")
  }, [])

  // Auto-lock after 5 minutes of being unlocked
  useEffect(() => {
    if (status !== "unlocked") return
    const timeout = setTimeout(() => lock(), 5 * 60 * 1000)
    return () => clearTimeout(timeout)
  }, [status])

  async function create(password: string) {
    const { mnemonic, address } = createWallet()
    const encrypted = await encryptSeed(mnemonic, password)
    setPending({ mnemonic, address, encrypted })
    setStatus("backup")
  }

  async function confirmBackup() {
    if (!pending) return

    const stored: StoredWallet = { encrypted: pending.encrypted, address: pending.address }
    localStorage.setItem("wallet", JSON.stringify(stored))

    const token = localStorage.getItem("token")
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address: pending.address }),
    })

    if (!res.ok) {
      alert("Error guardando address")
      return
    }

    setSeed(pending.mnemonic)
    setAddress(pending.address)
    setPending(null)
    setStatus("unlocked")
    getBalance(pending.address).then((b) => setBalance(formatEther(b)))
  }

  async function unlock(password: string) {
    const stored = JSON.parse(localStorage.getItem("wallet")!) as StoredWallet
    // throws "Invalid password" if wrong
    const mnemonic = await decryptSeed(stored.encrypted, password)
    setSeed(mnemonic)
    setAddress(stored.address)
    setStatus("unlocked")
    getBalance(stored.address).then((b) => setBalance(formatEther(b)))
  }

  function lock() {
    setSeed(null)
    setAddress(null)
    setBalance(null)
    setStatus("locked")
  }

  return {
    status,
    seed,
    address,
    balance,
    pendingMnemonic: pending?.mnemonic ?? null,
    create,
    confirmBackup,
    unlock,
    lock,
  }
}
