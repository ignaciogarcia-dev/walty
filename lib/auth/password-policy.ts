import { ValidationError } from "@/lib/api/errors"
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/constants"

const encoder = new TextEncoder()

/**
 * Validates password length for registration/login (bcrypt 72-byte limit).
 */
export function assertPasswordPolicy(password: string): void {
  if (typeof password !== "string") {
    throw new ValidationError("invalid-email-or-password")
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError("invalid-email-or-password")
  }
  if (encoder.encode(password).length > PASSWORD_MAX_BYTES) {
    throw new ValidationError("password-too-long")
  }
}

/** Normalize email for lookup/storage (lowercase + trim). */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") return ""
  return email.trim().toLowerCase()
}
