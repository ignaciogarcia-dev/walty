// In-memory staging for the ack-then-commit recovery handshake.
//
// Recovery re-randomises all three DKLS shares onto a new polynomial generation.
// If we overwrote the live server share immediately, a client that abandons the
// flow before durably saving its new device share + re-issued kit would be left
// with: server at gen N+1, but only the now-stale gen N kit — a permanent brick.
//
// Instead, `/api/mpc-recover` stages the encrypted new server share here (keyed
// by an unguessable token) and leaves the live DB row at gen N. The client only
// calls `/api/mpc-recover/commit` AFTER it has downloaded the new kit (gen N+1)
// and saved the new device share. Until then the old kit + live gen-N share stay
// a valid recovery pair, so an interrupted recovery is retryable, never bricking.
//
// Trade-off vs a DB staging table: a process restart drops pending entries (the
// client just retries recovery — nothing is lost, because we never destroyed the
// live share). This needs no schema change, which matters because the app runs
// against the production DB and additive migrations are out of scope here.

import { randomBytes } from "node:crypto"
import type { EncryptedShare } from "./serverShareStore.js"

interface StagedRecovery {
  userId: number
  keyId: string
  /** Encrypted new server share (party 1), already at version = nextVersion. */
  enc: EncryptedShare
  nextVersion: number
  expiresAt: number
  /** Set once committed; a re-commit with the same token is a no-op (idempotent). */
  consumed: boolean
}

const TTL_MS = 10 * 60 * 1000
// Keep a consumed entry briefly so a lost commit-response can be retried safely.
const CONSUMED_GRACE_MS = 60 * 1000

const store = new Map<string, StagedRecovery>()

function sweep(now: number): void {
  for (const [token, s] of store) {
    const deadline = s.consumed ? s.expiresAt + CONSUMED_GRACE_MS : s.expiresAt
    if (now >= deadline) store.delete(token)
  }
}

/** Stage an encrypted new server share; returns the opaque commit token. */
export function stageRecovery(
  userId: number,
  keyId: string,
  enc: EncryptedShare,
  nextVersion: number,
  now: number = Date.now(),
): string {
  sweep(now)
  // Only the latest recovery for a key may be committable. Two concurrent/retried
  // recoveries both read version N and stage DIFFERENT polynomials labelled N+1;
  // if both committed, the second would clobber the first and the server share
  // would no longer match the kit+device the user kept — a silent brick the
  // generation check can't catch (both are N+1). Evict any prior pending entry
  // for this key so its token can never be committed.
  for (const [t, s] of store) {
    if (s.keyId === keyId && !s.consumed) store.delete(t)
  }
  const token = randomBytes(32).toString("base64url")
  store.set(token, { userId, keyId, enc, nextVersion, expiresAt: now + TTL_MS, consumed: false })
  return token
}

export type TakeResult =
  | { status: "ready"; staged: StagedRecovery }
  | { status: "already_committed" }
  | { status: "not_found" }

/**
 * Resolve a token for commit. Returns the staged share to persist on first call;
 * an idempotent `already_committed` on retry; `not_found` if expired/unknown or
 * owned by a different user. The caller marks it consumed via `markConsumed`
 * only after the DB write succeeds.
 */
export function takeRecovery(
  userId: number,
  token: string,
  now: number = Date.now(),
): TakeResult {
  sweep(now)
  const staged = store.get(token)
  if (!staged || staged.userId !== userId) return { status: "not_found" }
  if (staged.consumed) return { status: "already_committed" }
  return { status: "ready", staged }
}

/** Mark a staged entry committed after the DB write lands (kept briefly for idempotency). */
export function markConsumed(token: string, now: number = Date.now()): void {
  const staged = store.get(token)
  if (staged) {
    staged.consumed = true
    staged.expiresAt = now
  }
}
