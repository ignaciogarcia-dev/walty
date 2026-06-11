// Direct DB access for state assertions + seeding. Uses a raw `pg` client with
// parameterized SQL rather than importing @walty/db: the workspace package's
// exports point at raw .ts which Playwright won't transform inside node_modules,
// and it isn't linked into the repo-root node_modules where the runner resolves.
// The local-only guard ensures the prod Supabase DB can never be touched.
import { Client } from "pg"

function assertLocalDb(): string {
  const url = process.env.DATABASE_URL ?? ""
  const { hostname } = new URL(url.replace(/^postgres(ql)?/, "http"))
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`e2e db helper: DATABASE_URL is not local (hostname: ${hostname}) — refusing`)
  }
  return url
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: assertLocalDb() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    // Swallow disconnect errors so fn()'s error propagates unmasked.
    try { await client.end() } catch { /* noop */ }
  }
}

/** The user's active MPC key, if DKG persisted one. */
export async function findActiveMpcKey(
  userId: number,
): Promise<{ id: string; address: string; status: string } | null> {
  return withClient(async (c) => {
    const r = await c.query<{ id: string; address: string; status: string }>(
      "SELECT id, address, status FROM mpc_keys WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [userId],
    )
    return r.rows[0] ?? null
  })
}

/** Whether the server share for a keyId is persisted. */
export async function hasServerShare(keyId: string): Promise<boolean> {
  return withClient(async (c) => {
    const r = await c.query("SELECT 1 FROM mpc_server_shares WHERE key_id = $1 LIMIT 1", [keyId])
    return (r.rowCount ?? 0) > 0
  })
}

export type MemberStatus = "invited" | "active" | "suspended" | "revoked"

/**
 * Seeds a business_members row (an invite, or an operator membership for gating
 * tests). `businessId`/`invitedBy` are the owner's user id. For an invite leave
 * userId null; for an operator membership pass the operator's userId + a status.
 * `expiresInDays` is relative (negative = already expired).
 */
export async function seedMember(opts: {
  businessId: number
  invitedBy: number
  token: string
  status?: MemberStatus
  role?: string
  userId?: number | null
  inviteEmail?: string | null
  expiresInDays?: number
}): Promise<void> {
  const {
    businessId,
    invitedBy,
    token,
    status = "invited",
    role = "cashier",
    userId = null,
    inviteEmail = null,
    expiresInDays = 7,
  } = opts
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO business_members
         (business_id, user_id, role, status, invite_token, invite_email, invited_by,
          expires_at, created_at${userId != null ? ", last_activity_at" : ""})
       VALUES ($1, $2, $3, $4, $5, $6, $7,
          NOW() + ($8 || ' days')::interval, NOW()${userId != null ? ", NOW()" : ""})`,
      [businessId, userId, role, status, token, inviteEmail, invitedBy,
        Number.isFinite(expiresInDays) ? String(expiresInDays) : (() => { throw new RangeError(`expiresInDays must be a finite number, got: ${expiresInDays}`) })()],
    )
  })
}
