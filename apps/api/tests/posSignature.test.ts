import { createPrivateKey, generateKeyPairSync, type KeyObject, sign } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  buildPosSigningString,
  sha256Hex,
  verifyPosSignature,
} from "../src/lib/posSignature.js"

// Raw 32-byte public key (hex) from a node KeyObject, matching what the browser
// sends and the DB stores.
function rawPublicKeyHex(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { x: string }
  return Buffer.from(jwk.x, "base64url").toString("hex")
}

function seedHex(privateKey: KeyObject): string {
  const jwk = privateKey.export({ format: "jwk" }) as { d: string }
  return Buffer.from(jwk.d, "base64url").toString("hex")
}

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex")

function message(bodyStr: string, timestamp: string, nonce: string): string {
  return buildPosSigningString({
    method: "POST",
    path: "/pos/payment-requests",
    bodyHashHex: sha256Hex(Buffer.from(bodyStr, "utf8")),
    timestamp,
    nonce,
  })
}

describe("verifyPosSignature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const pubHex = rawPublicKeyHex(publicKey)
  const body = JSON.stringify({ amountUsd: "10.00", token: "USDC" })
  const msg = message(body, "1730000000000", "abc123")

  it("accepts a valid signature", () => {
    const sig = sign(null, Buffer.from(msg, "utf8"), privateKey).toString("hex")
    expect(verifyPosSignature(pubHex, msg, sig)).toBe(true)
  })

  it("rejects a tampered message", () => {
    const sig = sign(null, Buffer.from(msg, "utf8"), privateKey).toString("hex")
    const tampered = message(JSON.stringify({ amountUsd: "9999.00", token: "USDC" }), "1730000000000", "abc123")
    expect(verifyPosSignature(pubHex, tampered, sig)).toBe(false)
  })

  it("rejects a signature from a different key", () => {
    const other = generateKeyPairSync("ed25519")
    const sig = sign(null, Buffer.from(msg, "utf8"), other.privateKey).toString("hex")
    expect(verifyPosSignature(pubHex, msg, sig)).toBe(false)
  })

  it("rejects malformed inputs without throwing", () => {
    expect(verifyPosSignature("not-hex", msg, "zz")).toBe(false)
    expect(verifyPosSignature(pubHex, msg, "00")).toBe(false)
  })

  // The Pi client rebuilds a private key from a raw 32-byte seed via the PKCS8
  // prefix trick. Its signature must interoperate with the SPKI-based verify.
  it("interoperates with a seed-reconstructed key (Pi client path)", () => {
    const seed = seedHex(privateKey)
    const rebuilt = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed, "hex")]),
      format: "der",
      type: "pkcs8",
    })
    const sig = sign(null, Buffer.from(msg, "utf8"), rebuilt).toString("hex")
    expect(verifyPosSignature(pubHex, msg, sig)).toBe(true)
  })
})
