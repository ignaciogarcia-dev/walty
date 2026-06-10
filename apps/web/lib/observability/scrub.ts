// Redaction for client error reporting: a leaked seed/key/share is catastrophic,
// so scrubbing is deliberately over-eager. False positives are harmless.

export interface ScrubbedError {
  name: string
  message: string
  tags: Record<string, string>
}

const REDACTED = "[REDACTED]"

// Order matters: hex before base64 so a hex key isn't half-matched by base64.
const PATTERNS: RegExp[] = [
  /\b(?:[a-z]+\s+){7,}[a-z]+\b/g, // BIP39-style mnemonic (8+ lowercase words)
  /\b(?:0x)?[0-9a-fA-F]{32,}\b/g, // private keys, MPC shares, addresses
  /[A-Za-z0-9+/]{40,}={0,2}/g, // long base64 blobs
]

/** Replace anything that looks like a secret with a fixed placeholder. */
export function scrubMessage(text: string): string {
  if (typeof text !== "string") return ""
  return PATTERNS.reduce((acc, pattern) => acc.replace(pattern, REDACTED), text)
}

// Only these context keys are forwarded (still scrubbed); everything else dropped.
const ALLOWED_TAGS = ["route", "boundary", "source", "digest"] as const

function buildTags(context?: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {}
  if (!context) return tags
  for (const key of ALLOWED_TAGS) {
    const value = context[key]
    if (value != null) tags[key] = scrubMessage(String(value))
  }
  return tags
}

// Minimal, secret-free payload. Never the raw error or its stack.
export function scrubError(
  error: unknown,
  context?: Record<string, unknown>,
): ScrubbedError {
  const tags = buildTags(context)

  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: scrubMessage(error.message ?? ""),
      tags,
    }
  }

  return {
    name: "NonError",
    message: scrubMessage(typeof error === "string" ? error : String(error)),
    tags,
  }
}
