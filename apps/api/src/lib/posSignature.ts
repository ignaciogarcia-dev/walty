import { createHash, createPublicKey, randomBytes, verify as nodeVerify } from "node:crypto"

// Headers a POS device attaches to every signed request.
export const POS_HEADERS = {
  id: "x-pos-id",
  timestamp: "x-pos-timestamp",
  nonce: "x-pos-nonce",
  signature: "x-pos-signature",
} as const

// A signed request is accepted only if its timestamp is within this window of
// the server clock (guards against replay of an old capture; the nonce guards
// against replay within the window).
export const POS_SIGNATURE_WINDOW_MS = 60_000

// DER SPKI prefix for a raw 32-byte Ed25519 public key. Prepending it lets
// node:crypto build a KeyObject from the raw key the device generated.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

function ed25519PublicKeyFromHex(publicKeyHex: string) {
  const raw = Buffer.from(publicKeyHex, "hex")
  if (raw.length !== 32) throw new Error("invalid ed25519 public key length")
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  })
}

export function sha256Hex(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex")
}

/**
 * Canonical string a POS device signs. Both the device and the server build it
 * identically; any mismatch (method, path, body, timestamp, nonce) fails
 * verification. `path` is the request pathname without query string.
 */
export function buildPosSigningString(params: {
  method: string
  path: string
  bodyHashHex: string
  timestamp: string
  nonce: string
}): string {
  return [
    params.method.toUpperCase(),
    params.path,
    params.bodyHashHex,
    params.timestamp,
    params.nonce,
  ].join("\n")
}

/** Verifies a hex-encoded Ed25519 signature over `message`. Never throws. */
export function verifyPosSignature(
  publicKeyHex: string,
  message: string,
  signatureHex: string,
): boolean {
  try {
    const key = ed25519PublicKeyFromHex(publicKeyHex)
    const sig = Buffer.from(signatureHex, "hex")
    if (sig.length !== 64) return false
    return nodeVerify(null, Buffer.from(message, "utf8"), key, sig)
  } catch {
    return false
  }
}

/** Convenience for tests / tooling: a random 128-bit nonce as hex. */
export function randomNonce(): string {
  return randomBytes(16).toString("hex")
}
