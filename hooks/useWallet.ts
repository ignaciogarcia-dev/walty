"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatEther, isAddress, parseEther } from "viem"
import { createWallet } from "@/lib/wallet"
import { encryptSeed, decryptSeed } from "@/lib/crypto"
import { getBalance, publicClient } from "@/lib/eth"
import { getWalletClient } from "@/lib/signer"
import { validateTx } from "@/lib/wallet-core"
import { getStoredWallet, saveWallet, type StoredWallet } from "@/lib/wallet-store"

export type WalletStatus = "loading" | "new" | "locked" | "unlocked"
export type TxStatus = "idle" | "pending" | "confirmed" | "error" | "pending_on_chain"

const LOCK_TIMEOUT_MS = 5 * 60 * 1000

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("loading")
  const [password, setPassword] = useState("")
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<TxStatus>("idle")
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)

  useEffect(() => {
    setStatus(getStoredWallet() ? "locked" : "new")
  }, [])

  // 2.4: stable reference — password cleared on every lock path
  const lock = useCallback(() => {
    setPassword("")
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

  // Sync on-chain status for all pending/failed transactions whenever wallet unlocks
  useEffect(() => {
    if (status !== "unlocked") return
    fetch("/api/tx/sync", { method: "POST" })
  }, [status])

  async function loadBalance(addr: string) {
    const b = await getBalance(addr as `0x${string}`)
    setBalance(formatEther(b))
  }

  async function linkWallet(addr: string, walletClient: ReturnType<typeof getWalletClient>) {
    // Step 1: get a server-issued one-time nonce (5-min TTL)
    const nonceRes = await fetch("/api/wallet/nonce", { method: "POST" })
    if (!nonceRes.ok) throw new Error("Error obteniendo nonce")
    const { nonce } = await nonceRes.json()

    // Step 2: sign the nonce — proves this client holds the private key
    const message = `Link wallet ${addr} nonce ${nonce}`
    const signature = await walletClient.signMessage({ message })

    // Step 3: send signature + nonce; server verifies and records the address
    const res = await fetch("/api/wallet/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: addr, signature, nonce }),
    })

    if (!res.ok) throw new Error("Error vinculando wallet")
  }

  async function create(password: string) {
    const { mnemonic, address } = createWallet()
    const encrypted = await encryptSeed(mnemonic, password)

    const walletClient = getWalletClient(mnemonic)
    await linkWallet(address, walletClient)

    saveWallet({ encrypted, address } satisfies StoredWallet)
    setAddress(address)
    setPassword(password)
    setStatus("unlocked")
    loadBalance(address)
  }

  async function unlock(password: string) {
    const stored = getStoredWallet()!
    // throws "Invalid password" if wrong
    await decryptSeed(stored.encrypted, password)
    setAddress(stored.address)
    setPassword(password)
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
    const stored = getStoredWallet()
    if (!stored) return
    const blob = new Blob([JSON.stringify(stored)], { type: "application/json" })
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
    saveWallet(parsed)
    setStatus("locked")
  }

  // 4.1: Returns estimated gas cost in ETH string for the confirm modal
  async function estimateGasCost(to: string, amount: string): Promise<string> {
    if (!address || !isAddress(to) || Number(amount) <= 0) {
      throw new Error("Parámetros inválidos")
    }
    const gas = await publicClient.estimateGas({
      account: address as `0x${string}`,
      to: to as `0x${string}`,
      value: parseEther(amount),
    })
    const gasPrice = await publicClient.getGasPrice()
    return formatEther(gas * gasPrice)
  }

  // Persists a transaction record; failures are silent so they never block the send flow
  async function recordTx(
    txHash: string,
    to: string,
    amount: string,
    status: "pending" | "confirmed" | "failed"
  ) {
    if (!address) return
    await fetch("/api/tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddress: address, toAddress: to, amount, txHash, status }),
    })
  }

  async function updateTxRecord(txHash: string, status: "confirmed" | "failed") {
    await fetch("/api/tx", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash, status }),
    })
  }

  async function send(to: string, amount: string) {
    if (!password || !address) {
      setTxStatus("error")
      setTxError("Wallet locked")
      return
    }

    try {
      setTxStatus("pending")
      setTxHash(null)
      setTxError(null)

      const currentBalance = await publicClient.getBalance({ address: address as `0x${string}` })

      // Basic validation: address format, self-send, amount > 0, rough balance check
      await validateTx({ to, amount, balance: currentBalance, address })

      const gas = await publicClient.estimateGas({
        account: address as `0x${string}`,
        to: to as `0x${string}`,
        value: parseEther(amount),
      })
      const gasPrice = await publicClient.getGasPrice()
      if (currentBalance < parseEther(amount) + gas * gasPrice) {
        throw new Error("Fondos insuficientes (incluye gas)")
      }

      // sendSecure: decrypt on demand — mnemonic stays local, never stored in state
      const stored = getStoredWallet()!
      const mnemonic = await decryptSeed(stored.encrypted, password)
      const walletClient = getWalletClient(mnemonic)
      const hash = await walletClient.sendTransaction({
        to: to as `0x${string}`,
        value: parseEther(amount),
        gas,
        gasPrice,
      })
      // mnemonic is a local const → GC when send() returns

      setTxHash(hash)
      // 3.3: persist as pending immediately after broadcast
      await recordTx(hash, to, amount, "pending").catch(() => {})

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
          // tx is on-chain but unconfirmed — leave DB status as "pending"
          setTxStatus("pending_on_chain")
          return
        }
        throw err
      }

      if (receipt.status === "success") {
        setTxStatus("confirmed")
        await updateTxRecord(hash, "confirmed").catch(() => {})
        if (address) loadBalance(address)
      } else {
        setTxStatus("error")
        setTxError("La transacción falló en la red")
        await updateTxRecord(hash, "failed").catch(() => {})
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
    address,
    balance,
    create,
    unlock,
    lock,
    exportWallet,
    importWallet,
    estimateGasCost,
    send,
    txStatus,
    txHash,
    txError,
    resetTx,
  }
}
