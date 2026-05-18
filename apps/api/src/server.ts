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

  // Force-exit fallback in case http/ws hang on lingering connections.
  const force = setTimeout(() => {
    logger.warn("graceful shutdown timed out, forcing exit")
    process.exit(1)
  }, 10_000)
  force.unref()

  // Drain HTTP first (stops accepting new connections, lets in-flight finish),
  // then close socket.io which disconnects any remaining WS clients. Don't
  // re-close the underlying HTTP server — socket.io's close attaches to it
  // and would double-close otherwise.
  server.close(() => {
    void closeWebSocket().finally(() => {
      clearTimeout(force)
      process.exit(0)
    })
  })
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
