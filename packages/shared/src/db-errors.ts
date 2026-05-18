/**
 * Returns true if the error is a PostgreSQL unique constraint violation (code 23505).
 * Use this to convert DB-level errors into typed ConflictError instead of inline code checks.
 *
 * Usage:
 *   if (isUniqueViolation(err)) throw new ConflictError("email-already-in-use")
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  )
}
