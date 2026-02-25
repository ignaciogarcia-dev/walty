"use client"
import { useEffect, useState } from "react"
import { getBalance } from "@/lib/eth"

export default function Dashboard() {
    const [balance, setBalance] = useState<string>("")

    useEffect(() => {
        const address = "0x68D9A25A2b93157dEF834bff3b62C0D7D212706f"

        getBalance(address).then((b) => {
            setBalance((Number(b) / 1e18).toString())
        })
    }, [])

    return (
        <div>
            Balance: {balance} ETH
        </div>
    )
}