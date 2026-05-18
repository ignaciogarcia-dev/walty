import { NextResponse } from "next/server"

/**
 * Standard success response. All API routes MUST use this for success.
 * Shape: { data: T }
 *
 * Exceptions (don't use ok()):
 * - Streaming responses
 * - Webhooks that require a specific shape (e.g. Stripe)
 * - Public polling endpoints that return a flat object by design
 */
export function ok<T>(data: T): Response {
  return NextResponse.json<{ data: T }>({ data })
}
