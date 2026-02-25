"use client"
import { useEffect, useState } from "react"
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

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("loading")
  const [password, setPassword] = useState("")
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

  function resetTx() {
    setTxStatus("idle")
    setTxHash(null)
    setTxError(null)
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
      if (currentBalance < parseEther(amount)) {
        setTxStatus("error")
        setTxError("Fondos insuficientes")
        return
      }

      const walletClient = getWalletClient(seed)

      const gas = await publicClient.estimateGas({
        account: address as `0x${string}`,
        to: to as `0x${string}`,
        value: parseEther(amount),
      })

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
    send,
    txStatus,
    txHash,
    txError,
    resetTx,
  }
}
