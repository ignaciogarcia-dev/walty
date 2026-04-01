import { NextRequest, NextResponse } from "next/server"
import { RateLimitError } from "@/lib/rate-limit"
import { AppError } from "./errors"

export function withErrorHandling<TContext>(
  handler: (req: NextRequest, ctx: TContext) => Promise<Response>
) {
  return async (req: NextRequest, ctx: TContext): Promise<Response> => {
    try {
      return await handler(req, ctx)
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(
          { error: error.code, ...(error.expose ? { message: error.message } : {}) },
          { status: error.status }
        )
      }

      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: error.retryAfter
              ? { "Retry-After": String(error.retryAfter) }
              : {},
          }
        )
      }

      console.error("[API ERROR]", error)

      return NextResponse.json(
        { error: "internal_error" },
        { status: 500 }
      )
    }
  }
}
