function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  get PAYMENTS_RECONCILE_SECRET() {
    return getRequiredEnv("PAYMENTS_RECONCILE_SECRET")
  },
}
