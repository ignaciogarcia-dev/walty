import type { ErrorRequestHandler, RequestHandler } from "express"
import { AppError } from "@walty/shared/api-utils/errors"
import { RateLimitError } from "@walty/shared/rate-limit"
import { logger } from "../config/logger.js"

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: "not_found", path: req.path })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.code,
      ...(err.expose ? { message: err.message } : {}),
    })
    return
  }
  if (err instanceof RateLimitError) {
    if (err.retryAfter) res.setHeader("Retry-After", String(err.retryAfter))
    res.status(429).json({ error: "Too many requests" })
    return
  }
  logger.error({ err }, "unhandled error")
  res.status(500).json({ error: "internal_error" })
}
