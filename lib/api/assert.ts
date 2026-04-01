import { ValidationError } from "./errors"

/**
 * Asserts a condition at the API boundary.
 * Throws ValidationError if the condition is falsy.
 *
 * Usage:
 *   assert(id && typeof id === "string", "invalid id")
 *   assert(amount > 0, "amount must be positive")
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message)
}
