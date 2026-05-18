import cookieParser from "cookie-parser"
import cors from "cors"
import express, { type Express } from "express"
import helmet from "helmet"
import pinoHttp from "pino-http"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"
import { authRouter } from "./routes/auth.js"
import { healthRouter } from "./routes/health.js"
import { pricesRouter } from "./routes/prices.js"
import { sessionRouter } from "./routes/session.js"
import { versionRouter } from "./routes/version.js"
import { walletRouter } from "./routes/wallet.js"

export function createApp(): Express {
  const app = express()

  app.disable("x-powered-by")
  app.set("trust proxy", 1)

  app.use(helmet())
  app.use(
    cors({
      origin: env.webOrigin,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: "1mb" }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())
  app.use(pinoHttp({ logger }))

  app.use(healthRouter)
  app.use(versionRouter)
  app.use(pricesRouter)
  app.use(authRouter)
  app.use(sessionRouter)
  app.use(walletRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
