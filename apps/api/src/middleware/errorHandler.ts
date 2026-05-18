import type { ErrorRequestHandler, RequestHandler } from "express"
import { logger } from "../config/logger.js"

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: "not_found", path: req.path })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message })
    return
  }
  logger.error({ err }, "unhandled error")
  res.status(500).json({ error: "internal_error" })
}
