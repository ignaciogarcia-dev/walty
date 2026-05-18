import cookieParser from "cookie-parser"
import cors from "cors"
import express, { type Express } from "express"
import helmet from "helmet"
import pinoHttp from "pino-http"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"
import { activityRouter } from "./routes/activity.js"
import { authRouter } from "./routes/auth.js"
import { businessRouter } from "./routes/business.js"
import { healthRouter } from "./routes/health.js"
import { internalRouter } from "./routes/internal.js"
import { joinRouter } from "./routes/join.js"
import { paymentRequestsRouter } from "./routes/paymentRequests.js"
import { refundRequestsRouter } from "./routes/refundRequests.js"
import { pricesRouter } from "./routes/prices.js"
import { sessionRouter } from "./routes/session.js"
import { txRouter } from "./routes/tx.js"
import { txIntentsRouter } from "./routes/txIntents.js"
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
  app.use(businessRouter)
  app.use(paymentRequestsRouter)
  app.use(txIntentsRouter)
  app.use(txRouter)
  app.use(refundRequestsRouter)
  app.use(activityRouter)
  app.use(joinRouter)
  app.use(internalRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
