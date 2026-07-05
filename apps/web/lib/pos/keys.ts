// Ed25519 keypair generation for POS terminals, done entirely in the browser
// with WebCrypto so the private key never reaches the server. The private key
// is returned as a raw 32-byte seed (hex) — the exact form a Raspberry Pi loads
// and re-derives from — and only the public key is sent to Walty.

export type PosKeypair = { privateKeyHex: string; publicKeyHex: string }

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + (b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4)))
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function generatePosKeypair(): Promise<PosKeypair> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error("WebCrypto is not available in this browser")

  let pair: CryptoKeyPair
  try {
    pair = (await subtle.generateKey(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair
  } catch {
    throw new Error("This browser does not support Ed25519 key generation")
  }

  // OKP JWK: `d` is the 32-byte private seed, `x` is the public key (both b64url).
  const jwk = (await subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey & {
    d?: string
    x?: string
  }
  if (!jwk.d || !jwk.x) throw new Error("Failed to export the generated key")

  return {
    privateKeyHex: bytesToHex(base64urlToBytes(jwk.d)),
    publicKeyHex: bytesToHex(base64urlToBytes(jwk.x)),
  }
}
