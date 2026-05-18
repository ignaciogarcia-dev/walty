const required = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  appEnv: process.env.APP_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: required("WEB_ORIGIN", "http://localhost:3000"),
  logLevel: process.env.LOG_LEVEL ?? "info",
}

export const isProduction = env.appEnv === "production"
