import type { NextFunction, Request, RequestHandler, Response } from "express"

// Express 5 types every param as `string | string[]` because `*wildcard`
// segments yield arrays. No route here uses wildcards, so named `:params`
// are always strings at runtime.
export type RouteParams = Record<string, string>

export const asyncHandler =
  <Req extends Request = Request<RouteParams>, Res extends Response = Response>(
    fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as Req, res as Res, next)).catch(next)
  }
