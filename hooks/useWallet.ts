"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatEther, isAddress, parseEther, parseUnits, erc20Abi } from "viem"
import { createWallet } from "@/lib/wallet"
import type { Token } from "@/lib/tokens"
import { encryptSeed, decryptSeed, encryptSeedWithPin, decryptSeedWithPin, type PinEncryptedSeed } from "@/lib/crypto"
import { getBalance, publicClient } from "@/lib/eth"
import { getWalletClient } from "@/lib/signer"
import { validateTx } from "@/lib/wallet-core"
import { getStoredWallet, saveWallet, type StoredWallet } from "@/lib/wallet-store"
import { determineWalletStatus } from "@/lib/wallet-status"

export type WalletStatus = "loading" | "new" | "locked" | "unlocked" | "recoverable"
export type TxStatus = "idle" | "pending" | "confirmed" | "error" | "pending_on_chain"

export type TxRecord = {
  id: number
  fromAddress: string
  toAddress: string
  amount: string
  txHash: string
  status: "pending" | "confirmed" | "failed"
  createdAt: string | null
}

const LOCK_TIMEOUT_MS = 5 * 60 * 1000

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("loading")
  const [password, setPassword] = useState("")
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<TxStatus>("idle")
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [txHistory, setTxHistory] = useState<TxRecord[]>([])

  useEffect(() => {
    async function checkWalletStatus() {
      const initialStatus = await determineWalletStatus()
      setStatus(initialStatus)
    }
    
    checkWalletStatus()
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

  async function loadTxHistory() {
    const res = await fetch("/api/tx")
    if (res.ok) setTxHistory(await res.json())
  }

  // Sync on-chain status for all pending transactions on unlock, then refresh history
  useEffect(() => {
    if (status !== "unlocked") return
    fetch("/api/tx/sync", { method: "POST" })
      .catch(() => {})
      .then(() => loadTxHistory().catch(() => {}))
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
    if (!password || password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres")
    }

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

  async function fetchChallenge(): Promise<string> {
    const res = await fetch("/api/wallet/challenge")
    if (!res.ok) throw new Error("Error obteniendo challenge del servidor")
    const { challenge } = await res.json()
    return challenge
  }

  // Creates a PIN-encrypted backup of the seed on the server.
  // Seed is decrypted locally using the current wallet password, then re-encrypted with PIN+challenge.
  // The server never sees the seed or the PIN.
  async function createBackup(pin: string): Promise<void> {
    if (!password || !address) throw new Error("Wallet bloqueada")
    if (pin.length < 4) throw new Error("El PIN debe tener al menos 4 dígitos")

    const stored = getStoredWallet()!
    const mnemonic = await decryptSeed(stored.encrypted, password)

    const challenge = await fetchChallenge()
    const pinEncrypted = await encryptSeedWithPin(mnemonic, pin, challenge)

    const res = await fetch("/api/wallet/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ciphertext: pinEncrypted.ciphertext,
        iv: pinEncrypted.iv,
        salt: pinEncrypted.salt,
        version: pinEncrypted.version,
        walletAddress: address,
      }),
    })

    if (!res.ok) throw new Error("Error guardando backup en el servidor")
  }

  // Recovers the wallet from the server backup using a PIN.
  // Downloads the encrypted backup, decrypts with PIN+challenge, then re-encrypts locally
  // with a new local password and saves to localStorage.
  async function recoverWallet(pin: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres")

    const [backupRes, challenge] = await Promise.all([
      fetch("/api/wallet/backup").then((r) => r.json()),
      fetchChallenge(),
    ])

    const backup = backupRes.backup as PinEncryptedSeed | null
    if (!backup) throw new Error("No se encontró backup en el servidor")

    const backupFull = backupRes.backup as PinEncryptedSeed & { walletAddress: string }
    const mnemonic = await decryptSeedWithPin(backupFull, pin, challenge)

    // Re-encrypt locally with the new password and save
    const encrypted = await encryptSeed(mnemonic, newPassword)
    const addr = backupFull.walletAddress

    saveWallet({ encrypted, address: addr })
    setAddress(addr)
    setPassword(newPassword)
    setStatus("unlocked")
    loadBalance(addr)
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

  // Returns estimated gas cost in ETH for native ETH or ERC-20 transfers
  async function estimateTokenGasCost(token: Token, to: string, amount: string): Promise<string> {
    if (!address || !isAddress(to) || Number(amount) <= 0) {
      throw new Error("Parámetros inválidos")
    }
    const gasPrice = await publicClient.getGasPrice()
    if (token.address === null) {
      const gas = await publicClient.estimateGas({
        account: address as `0x${string}`,
        to: to as `0x${string}`,
        value: parseEther(amount),
      })
      return formatEther(gas * gasPrice)
    } else {
      const gas = await publicClient.estimateContractGas({
        address: token.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, parseUnits(amount, token.decimals)],
        account: address as `0x${string}`,
      })
      return formatEther(gas * gasPrice)
    }
  }

  // Unified send for native ETH and ERC-20 tokens
  async function sendToken(token: Token, to: string, amount: string) {
    if (!password || !address) {
      setTxStatus("error")
      setTxError("Wallet locked")
      return
    }

    try {
      setTxStatus("pending")
      setTxHash(null)
      setTxError(null)

      if (!isAddress(to)) throw new Error("Invalid address")
      if (to.toLowerCase() === address.toLowerCase()) throw new Error("Cannot send to yourself")
      if (Number(amount) <= 0) throw new Error("Invalid amount")

      const stored = getStoredWallet()!
      const mnemonic = await decryptSeed(stored.encrypted, password)
      const walletClient = getWalletClient(mnemonic)
      const gasPrice = await publicClient.getGasPrice()

      let hash: `0x${string}`

      if (token.address === null) {
        // Native ETH
        const currentBalance = await publicClient.getBalance({ address: address as `0x${string}` })
        const value = parseEther(amount)
        const gas = await publicClient.estimateGas({
          account: address as `0x${string}`,
          to: to as `0x${string}`,
          value,
        })
        if (currentBalance < value + gas * gasPrice) {
          throw new Error("Fondos insuficientes (incluye gas)")
        }
        hash = await walletClient.sendTransaction({
          to: to as `0x${string}`,
          value,
          gas,
          gasPrice,
        })
      } else {
        // ERC-20
        const tokenAmount = parseUnits(amount, token.decimals)
        const gas = await publicClient.estimateContractGas({
          address: token.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [to as `0x${string}`, tokenAmount],
          account: address as `0x${string}`,
        })
        hash = await walletClient.writeContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [to as `0x${string}`, tokenAmount],
          gas,
          gasPrice,
        })
      }

      setTxHash(hash)
      await recordTx(hash, to, amount).catch(() => {})

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
          loadTxHistory().catch(() => {})
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
      loadTxHistory().catch(() => {})
    } catch (err: unknown) {
      setTxStatus("error")
      setTxError(err instanceof Error ? err.message : "Error desconocido")
    }
  }

  // Persists a transaction record as pending; failures are silent so they never block the send flow
  async function recordTx(txHash: string, to: string, amount: string) {
    if (!address) return
    await fetch("/api/tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddress: address, toAddress: to, amount, txHash }),
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
      // persist as pending immediately after broadcast
      await recordTx(hash, to, amount).catch(() => {})

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
          loadTxHistory().catch(() => {})
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
      loadTxHistory().catch(() => {})
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
    createBackup,
    recoverWallet,
    estimateGasCost,
    estimateTokenGasCost,
    send,
    sendToken,
    txStatus,
    txHash,
    txError,
    resetTx,
    txHistory,
  }
}
