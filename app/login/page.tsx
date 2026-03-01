"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Tab = "login" | "register"

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)

    const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register"

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (res.ok) {
        router.push("/dashboard")
      } else {
        const data = await res.json()
        setError(data.error ?? "Error inesperado")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-10 flex flex-col gap-4 max-w-sm">
      <div className="flex gap-4">
        <button
          onClick={() => { setTab("login"); setError(null) }}
          style={{ fontWeight: tab === "login" ? "bold" : "normal" }}
        >
          Login
        </button>
        <button
          onClick={() => { setTab("register"); setError(null) }}
          style={{ fontWeight: tab === "register" ? "bold" : "normal" }}
        >
          Register
        </button>
      </div>

      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? "..." : tab === "login" ? "Ingresar" : "Registrarse"}
      </button>
    </div>
  )
}
