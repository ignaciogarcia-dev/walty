function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/** Validate all required env vars at startup. Call from instrumentation.ts. */
export function validateEnv() {
  const required = ["DATABASE_URL", "JWT_SECRET"]

  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    )
  }

  if (
    process.env.APP_ENV === "production" &&
    process.env.JWT_SECRET === "dev-secret"
  ) {
    throw new Error(
      "JWT_SECRET is set to 'dev-secret' in production. Generate a secure one: openssl rand -base64 32"
    )
  }
}

export const env = {
  get PAYMENTS_RECONCILE_SECRET() {
    return getRequiredEnv("PAYMENTS_RECONCILE_SECRET")
  },
}
