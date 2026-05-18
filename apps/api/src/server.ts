import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { initWebSocket } from "./ws/io.js"

const app = createApp()

const server = app.listen(env.port, () => {
  logger.info({ port: env.port, env: env.appEnv }, "api listening")
})

initWebSocket(server)

const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting down")
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
