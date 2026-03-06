"use client"
import { useEffect, useState } from "react"

export interface UserData {
  userId: number
  email: string
  username: string | null
}

export function useUser() {
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUser() {
      try {
        setLoading(true)
        setError(null)

        // Fetch user data from /api/me
        const meResponse = await fetch("/api/me")
        if (!meResponse.ok) {
          throw new Error("Failed to fetch user")
        }
        const { user: userData } = await meResponse.json()

        // Fetch username from profile
        const profileResponse = await fetch("/api/profile")
        let username: string | null = null
        if (profileResponse.ok) {
          const { username: profileUsername } = await profileResponse.json()
          username = profileUsername
        }

        setUser({
          userId: userData.userId,
          email: userData.email,
          username,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, error }
}
