"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatEther, isAddress, parseEther } from "viem"
import { createWallet } from "@/lib/wallet"
import { encryptSeed, decryptSeed, EncryptedSeed } from "@/lib/crypto"
import { getBalance, client as publicClient } from "@/lib/eth"
import { getWalletClient } from "@/lib/signer"

type StoredWallet = {
  encrypted: EncryptedSeed
  address: string
}

export type WalletStatus = "loading" | "new" | "locked" | "unlocked"
export type TxStatus = "idle" | "pending" | "confirmed" | "error" | "pending_on_chain"

const LOCK_TIMEOUT_MS = 5 * 60 * 1000

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("loading")
  const [password, setPassword] = useState("")
  // 2.4: seed lives only in React state — never logged, cleared on lock
  const [seed, setSeed] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<TxStatus>("idle")
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("wallet")
    setStatus(stored ? "locked" : "new")
  }, [])

  // 2.4: stable reference — setSeed(null) is called on every lock path
  const lock = useCallback(() => {
    setSeed(null)
    setAddress(null)
    setBalance(null)
    setStatus("locked")
  }, [])

  // 2.2: auto-lock on inactivity (5 min) + reset on interaction + lock on tab blur
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (status !== "unlocked") return

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(lock, LOCK_TIMEOUT_MS)
    }

    const reset = () => schedule()

    schedule()

    const events = ["mousemove", "keydown", "click", "touchstart"] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    window.addEventListener("blur", lock)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, reset))
      window.removeEventListener("blur", lock)
    }
  }, [status, lock])

  async function loadBalance(addr: string) {
    const b = await getBalance(addr as `0x${string}`)
    setBalance(formatEther(b))
  }

  async function create(password: string) {
    const { mnemonic, address } = createWallet()
    const encrypted = await encryptSeed(mnemonic, password)

    localStorage.setItem("wallet", JSON.stringify({ encrypted, address } satisfies StoredWallet))

    const token = localStorage.getItem("token")
    if (!token) throw new Error("Not authenticated")

    // Decode userId from JWT payload (no verification needed client-side)
    const { userId } = JSON.parse(atob(token.split(".")[1])) as { userId: string }

    // Sign ownership proof: proves this frontend controls the private key
    const walletClient = getWalletClient(mnemonic)
    const message = `Link wallet ${address} to user ${userId}`
    const signature = await walletClient.signMessage({ message })

    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address, signature }),
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

  function resetTx() {
    setTxStatus("idle")
    setTxHash(null)
    setTxError(null)
  }

  // 2.1: Export encrypted wallet to a JSON file — seed never leaves encrypted
  function exportWallet() {
    const stored = localStorage.getItem("wallet")
    if (!stored) return
    const blob = new Blob([stored], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "walty-backup.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  // 2.1: Import wallet from a JSON backup file
  async function importWallet(file: File) {
    const text = await file.text()
    const parsed = JSON.parse(text) as StoredWallet
    if (!parsed.encrypted || !parsed.address) throw new Error("Archivo inválido")
    localStorage.setItem("wallet", JSON.stringify(parsed))
    setStatus("locked")
  }

  async function send(to: string, amount: string) {
    if (!seed) throw new Error("Wallet locked")

    if (!isAddress(to)) {
      setTxStatus("error")
      setTxError("Dirección inválida")
      return
    }

    if (Number(amount) <= 0) {
      setTxStatus("error")
      setTxError("Monto inválido")
      return
    }

    if (address && to.toLowerCase() === address.toLowerCase()) {
      setTxStatus("error")
      setTxError("No podés enviarte a vos mismo")
      return
    }

    try {
      setTxStatus("pending")
      setTxHash(null)
      setTxError(null)

      const currentBalance = await publicClient.getBalance({ address: address as `0x${string}` })

      const gas = await publicClient.estimateGas({
        account: address as `0x${string}`,
        to: to as `0x${string}`,
        value: parseEther(amount),
      })
      const gasPrice = await publicClient.getGasPrice()
      const totalCost = parseEther(amount) + gas * gasPrice

      if (currentBalance < totalCost) {
        setTxStatus("error")
        setTxError("Fondos insuficientes (incluye gas)")
        return
      }

      const walletClient = getWalletClient(seed)

      const hash = await walletClient.sendTransaction({
        to: to as `0x${string}`,
        value: parseEther(amount),
        gas,
      })

      setTxHash(hash)

      let receipt
      try {
        receipt = await Promise.race([
          publicClient.waitForTransactionReceipt({ hash }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 60_000)
          ),
        ])
      } catch (err) {
        if (err instanceof Error && err.message === "timeout") {
          setTxStatus("pending_on_chain")
          return
        }
        throw err
      }

      if (receipt.status === "success") {
        setTxStatus("confirmed")
        if (address) loadBalance(address)
      } else {
        setTxStatus("error")
        setTxError("La transacción falló en la red")
      }
    } catch (err: unknown) {
      setTxStatus("error")
      setTxError(err instanceof Error ? err.message : "Error desconocido")
    }
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
    exportWallet,
    importWallet,
    send,
    txStatus,
    txHash,
    txError,
    resetTx,
  }
}
