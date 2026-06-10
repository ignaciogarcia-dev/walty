import { isReportingEnabled } from "./consent"
import { scrubError, type ScrubbedError } from "./scrub"
import { consoleSink, type ErrorSink } from "./sink"

// Single entry point for client error reporting: always scrubbed, gated, and
// wrapped so a reporting failure can never crash the app.

let activeSink: ErrorSink = consoleSink

export function setSink(sink: ErrorSink): void {
  activeSink = sink
}

export function resetSink(): void {
  activeSink = consoleSink
}

function hasDsn(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ERROR_REPORTING_DSN)
}

// Dev: always (local visibility). Prod: only with a DSN and explicit opt-in.
export function shouldReport(): boolean {
  if (process.env.NODE_ENV !== "production") return true
  return hasDsn() && isReportingEnabled()
}

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): ScrubbedError {
  const payload = scrubError(error, context)
  try {
    if (shouldReport()) activeSink.capture(payload)
  } catch {
    // Reporting must never crash the app.
  }
  return payload
}
