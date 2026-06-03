import { and, eq, lt } from "drizzle-orm"
import { db, deviceSessions, devicePairingRequests } from "@walty/db"

export type DeviceSession = typeof deviceSessions.$inferSelect

const MAX_LABEL_LEN = 120

/** Best-effort device label from the User-Agent; never trusted, display only. */
export function deviceLabelFromUserAgent(ua: string | undefined): string {
  const trimmed = (ua ?? "").trim()
  if (!trimmed) return "Unknown device"
  return trimmed.slice(0, MAX_LABEL_LEN)
}

/** Creates a pending (untrusted) session and returns its id (the JWT `sid`). */
export async function createDeviceSession(
  userId: number,
  label: string,
): Promise<string> {
  const [row] = await db
    .insert(deviceSessions)
    .values({ userId, label })
    .returning({ id: deviceSessions.id })
  return row.id
}

/** Looks up a session by id. Returns the row regardless of revoked/trusted state. */
export async function findSession(sid: string): Promise<DeviceSession | null> {
  const row = await db.query.deviceSessions.findFirst({
    where: eq(deviceSessions.id, sid),
  })
  return row ?? null
}

export async function markSessionTrusted(sid: string): Promise<void> {
  await db
    .update(deviceSessions)
    .set({ trustedAt: new Date() })
    .where(eq(deviceSessions.id, sid))
}

export async function revokeSession(sid: string): Promise<void> {
  await db
    .update(deviceSessions)
    .set({ revokedAt: new Date() })
    .where(eq(deviceSessions.id, sid))
}

/** Flips pending pairing requests past their TTL to "expired". Returns count. */
export async function expireStalePairings(): Promise<number> {
  const rows = await db
    .update(devicePairingRequests)
    .set({ status: "expired" })
    .where(
      and(
        eq(devicePairingRequests.status, "pending"),
        lt(devicePairingRequests.expiresAt, new Date()),
      ),
    )
    .returning({ id: devicePairingRequests.id })
  return rows.length
}

const LAST_SEEN_THROTTLE_MS = 60_000

/** Updates lastSeenAt at most once per minute to avoid a write per request. */
export function touchSessionSeen(session: DeviceSession): void {
  const age = Date.now() - session.lastSeenAt.getTime()
  if (age < LAST_SEEN_THROTTLE_MS) return
  void db
    .update(deviceSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(deviceSessions.id, session.id))
    .catch(() => {})
}
