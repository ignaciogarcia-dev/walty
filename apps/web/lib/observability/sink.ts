import type { ScrubbedError } from "./scrub"

// Where a scrubbed payload goes; swappable via setSink() (e.g. a Sentry adapter).
export interface ErrorSink {
  capture(payload: ScrubbedError): void
}

export const consoleSink: ErrorSink = {
  capture(payload) {
    console.error("[walty:error]", payload)
  },
}
