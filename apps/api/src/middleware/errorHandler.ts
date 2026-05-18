import type { ErrorRequestHandler, Request, RequestHandler } from "express"
import { AppError } from "@walty/shared/api-utils/errors"
import { RateLimitError } from "@walty/shared/rate-limit"
import { logger } from "../config/logger.js"

function requestLogger(req: Request) {
  return (req as Request & { log?: typeof logger }).log ?? logger
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: "not_found", path: req.path })
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = requestLogger(req)

  if (err instanceof AppError) {
    log.warn(
      {
        status: err.status,
        code: err.code,
        path: req.path,
        method: req.method,
      },
      "app error",
    )
    res.status(err.status).json({
      error: err.code,
      ...(err.expose ? { message: err.message } : {}),
    })
    return
  }
  if (err instanceof RateLimitError) {
    if (err.retryAfter) res.setHeader("Retry-After", String(err.retryAfter))
    log.warn(
      {
        retryAfter: err.retryAfter,
        path: req.path,
        method: req.method,
      },
      "rate limited",
    )
    res.status(429).json({ error: "Too many requests" })
    return
  }
  log.error({ err, path: req.path, method: req.method }, "unhandled error")
  res.status(500).json({ error: "internal_error" })
}
