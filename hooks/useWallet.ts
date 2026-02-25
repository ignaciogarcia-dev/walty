"use client"
import { useEffect, useState } from "react"
import { formatEther, parseEther } from "viem"
import { createWallet } from "@/lib/wallet"
import { encryptSeed, decryptSeed, EncryptedSeed } from "@/lib/crypto"
import { getBalance } from "@/lib/eth"
import { getWalletClient } from "@/lib/signer"

type StoredWallet = {
  encrypted: EncryptedSeed
  address: string
}

export type WalletStatus = "loading" | "new" | "locked" | "unlocked"

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("loading")
  const [password, setPassword] = useState("")
  const [seed, setSeed] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("wallet")
    setStatus(stored ? "locked" : "new")
  }, [])

  // Auto-lock after 5 minutes
  useEffect(() => {
    if (status !== "unlocked") return
    const timeout = setTimeout(() => lock(), 5 * 60 * 1000)
    return () => clearTimeout(timeout)
  }, [status])

  async function loadBalance(addr: string) {
    const b = await getBalance(addr as `0x${string}`)
    setBalance(formatEther(b))
  }

  async function create(password: string) {
    const { mnemonic, address } = createWallet()
    const encrypted = await encryptSeed(mnemonic, password)

    localStorage.setItem("wallet", JSON.stringify({ encrypted, address } satisfies StoredWallet))

    const token = localStorage.getItem("token")
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address }),
    })

    if (!res.ok) {
      alert("Error guardando address")
      return
    }

    setSeed(mnemonic)
    setAddress(address)
    setPassword("")
    setStatus("unlocked")
    loadBalance(address)
  }

  async function unlock(password: string) {
    const stored = JSON.parse(localStorage.getItem("wallet")!) as StoredWallet
    // throws "Invalid password" if wrong
    const mnemonic = await decryptSeed(stored.encrypted, password)
    setSeed(mnemonic)
    setAddress(stored.address)
    setPassword("")
    setStatus("unlocked")
    loadBalance(stored.address)
  }

  function lock() {
    setSeed(null)
    setAddress(null)
    setBalance(null)
    setStatus("locked")
  }

  async function send(to: string, amount: string) {
    if (!seed) throw new Error("Wallet locked")

    const client = getWalletClient(seed)

    const hash = await client.sendTransaction({
      to: to as `0x${string}`,
      value: parseEther(amount),
    })

    return hash
  }

  return {
    status,
    password,
    setPassword,
    seed,
    address,
    balance,
    create,
    unlock,
    lock,
    send,
  }
}
