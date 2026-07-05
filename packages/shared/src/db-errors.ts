/**
 * Extracts a PostgreSQL error code (e.g. "23505") from an error, unwrapping
 * driver/ORM wrappers. drizzle-orm raises a `DrizzleQueryError` whose underlying
 * `pg` error (which carries the code) is on `.cause`, so a top-level `.code`
 * check alone misses constraint violations that come through drizzle.
 */
export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const e = error as { code?: unknown; cause?: unknown }
  if (typeof e.code === "string") return e.code
  if (e.cause) return pgErrorCode(e.cause)
  return undefined
}

/**
 * Returns true if the error is a PostgreSQL unique constraint violation (code 23505).
 * Use this to convert DB-level errors into typed ConflictError instead of inline code checks.
 *
 * Usage:
 *   if (isUniqueViolation(err)) throw new ConflictError("email-already-in-use")
 */
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505"
}
