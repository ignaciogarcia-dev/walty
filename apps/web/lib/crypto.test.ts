import { describe, it, expect } from "vitest"
import {
  encryptSeedV3,
  decryptSeedV3,
  validatePin,
} from "./crypto"

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
const TEST_PIN = "123456"

describe("crypto V3", () => {
  it("roundtrip: encrypt → decrypt → equals", async () => {
    const encrypted = await encryptSeedV3(TEST_MNEMONIC, TEST_PIN)
    const decrypted = await decryptSeedV3(encrypted, TEST_PIN)
    expect(decrypted).toBe(TEST_MNEMONIC)
  })

  it("wrong PIN throws", async () => {
    const encrypted = await encryptSeedV3(TEST_MNEMONIC, TEST_PIN)
    await expect(decryptSeedV3(encrypted, "654321")).rejects.toThrow(
      "Invalid password",
    )
  })

  it("backup integrity: serialized JSON → parse → decrypt OK", async () => {
    const encrypted = await encryptSeedV3(TEST_MNEMONIC, TEST_PIN)
    const json = JSON.stringify(encrypted)
    const parsed = JSON.parse(json)
    const decrypted = await decryptSeedV3(parsed, TEST_PIN)
    expect(decrypted).toBe(TEST_MNEMONIC)
  })

  it("encrypted output has correct shape and version", async () => {
    const encrypted = await encryptSeedV3(TEST_MNEMONIC, TEST_PIN)
    expect(encrypted.version).toBe(3)
    expect(typeof encrypted.encryptedSeed).toBe("string")
    expect(typeof encrypted.seedIv).toBe("string")
    expect(typeof encrypted.encryptedDK).toBe("string")
    expect(typeof encrypted.dkIv).toBe("string")
    expect(typeof encrypted.salt).toBe("string")
  })
})

describe("validatePin", () => {
  it("rejects short PINs", () => {
    expect(() => validatePin("1234")).toThrow("PIN must be 6–8 digits")
  })

  it("rejects long PINs", () => {
    expect(() => validatePin("123456789")).toThrow("PIN must be 6–8 digits")
  })

  it("rejects non-numeric PINs", () => {
    expect(() => validatePin("abc123")).toThrow("PIN must be numeric")
  })

  it("accepts valid 6-digit PIN", () => {
    expect(() => validatePin("123456")).not.toThrow()
  })

  it("accepts valid 8-digit PIN", () => {
    expect(() => validatePin("12345678")).not.toThrow()
  })
})
