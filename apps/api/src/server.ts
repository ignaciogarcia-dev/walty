import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { startWorkers, stopWorkers } from "./workers/index.js"
import { closeWebSocket, initWebSocket } from "./ws/io.js"

const app = createApp()

const server = app.listen(env.port, () => {
  logger.info({ port: env.port, env: env.appEnv }, "api listening")
})

initWebSocket(server)
startWorkers()

let shuttingDown = false

const shutdown = (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, "shutting down")

  stopWorkers()

  // Force-exit fallback in case socket.io / http hang on lingering connections.
  const force = setTimeout(() => {
    logger.warn("graceful shutdown timed out, forcing exit")
    process.exit(1)
  }, 10_000)
  force.unref()

  void closeWebSocket().finally(() => {
    server.close(() => {
      clearTimeout(force)
      process.exit(0)
    })
  })
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
