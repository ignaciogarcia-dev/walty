import type { NextFunction, Request, RequestHandler, Response } from "express"
import type { ZodType } from "zod"
import { ValidationError } from "@walty/shared/api-utils/errors"

/**
 * Parses `req.body` against a Zod schema at the request boundary. On success the
 * body is replaced with the parsed value (unknown keys stripped, coercions
 * applied) so handlers see a typed, normalized object. On failure it throws a
 * 400 ValidationError naming the first offending field — the errorHandler turns
 * that into `{ error: "validation_error", message }`.
 *
 * This is the structural gate only; deeper semantic checks (token registry,
 * amount precision, signed-tx ↔ payload binding) stay in their domain helpers.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const [issue] = result.error.issues
      const path = issue?.path.join(".")
      const message = issue
        ? path
          ? `${path}: ${issue.message}`
          : issue.message
        : "Invalid request body"
      next(new ValidationError(message))
      return
    }
    req.body = result.data
    next()
  }
}
