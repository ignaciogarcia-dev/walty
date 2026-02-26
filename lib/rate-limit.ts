const map = new Map<string, { count: number; time: number }>()

export function rateLimit(ip: string) {
  const now = Date.now()
  const entry = map.get(ip) || { count: 0, time: now }

  if (now - entry.time < 60000) {
    entry.count++
    if (entry.count > 20) throw new Error("Rate limit")
  } else {
    entry.count = 1
    entry.time = now
  }

  map.set(ip, entry)
}
