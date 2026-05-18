/** Session cookie + JWT lifetime (must stay in sync). */
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60 // 7 days

/** bcrypt cost factor (OWASP recommends ≥10; 12 is a reasonable default). */
export const BCRYPT_ROUNDS = 12

/** bcrypt truncates at 72 bytes — reject longer input to avoid silent truncation. */
export const PASSWORD_MAX_BYTES = 72

export const PASSWORD_MIN_LENGTH = 8
