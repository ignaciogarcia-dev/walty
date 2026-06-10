import { describe, expect, it } from "vitest"
import { scrubError, scrubMessage } from "./scrub"

// Pin the redaction so a regression that leaks a mnemonic/key/share fails loudly.

const MNEMONIC =
  "legal winner thank year wave sausage worth useful legal winner thank yellow"
const PRIV_KEY =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const SHARE_B64 =
  "TWFueSBoYW5kcyBtYWtlIGxpZ2h0IHdvcmsgYW5kIHRoaXMgaXMgYSBzaGFyZQ=="

describe("scrubMessage", () => {
  it("leaves an ordinary message untouched", () => {
    const msg = "Failed to fetch payment request (network error)"
    expect(scrubMessage(msg)).toBe(msg)
  })

  it("redacts a bare private-key hex", () => {
    const out = scrubMessage(`signing failed with key ${PRIV_KEY}`)
    expect(out).not.toContain(PRIV_KEY)
    expect(out).toContain("signing failed with key")
  })

  it("redacts a 0x-prefixed key and an address", () => {
    expect(scrubMessage(`key 0x${PRIV_KEY}`)).not.toContain(PRIV_KEY)
    const out = scrubMessage(`from ${ADDRESS} reverted`)
    expect(out).not.toContain(ADDRESS)
    expect(out).toContain("reverted")
  })

  it("redacts a BIP39-looking mnemonic phrase", () => {
    const out = scrubMessage(`restore failed: ${MNEMONIC}`)
    expect(out).not.toContain("sausage")
    expect(out).not.toContain(MNEMONIC)
    expect(out).toContain("restore failed:")
  })

  it("redacts a long base64 blob (serialized share)", () => {
    const out = scrubMessage(`share decode error ${SHARE_B64}`)
    expect(out).not.toContain(SHARE_B64)
  })

  it("coerces a non-string input to a safe string", () => {
    expect(typeof scrubMessage(undefined as unknown as string)).toBe("string")
  })
})

describe("scrubError", () => {
  it("extracts name and scrubbed message from an Error", () => {
    const result = scrubError(new Error(`boom ${PRIV_KEY}`))
    expect(result.name).toBe("Error")
    expect(result.message).toContain("boom")
    expect(result.message).not.toContain(PRIV_KEY)
  })

  it("never carries a raw stack", () => {
    const result = scrubError(new Error("boom")) as unknown as Record<
      string,
      unknown
    >
    expect(result).not.toHaveProperty("stack")
  })

  it("handles a non-Error throw", () => {
    const result = scrubError("just a string")
    expect(typeof result.name).toBe("string")
    expect(result.message).toContain("just a string")
  })

  it("handles an error with no message", () => {
    const result = scrubError(new Error())
    expect(result.message).toBe("")
  })

  it("only keeps allowlisted context keys as tags", () => {
    const result = scrubError(new Error("x"), {
      route: "/pay/123",
      boundary: "pay",
      source: "react-query",
      digest: "abc",
      mnemonic: MNEMONIC,
      secret: PRIV_KEY,
    })
    expect(result.tags).toEqual({
      route: "/pay/123",
      boundary: "pay",
      source: "react-query",
      digest: "abc",
    })
    expect(JSON.stringify(result.tags)).not.toContain("sausage")
    expect(JSON.stringify(result.tags)).not.toContain(PRIV_KEY)
  })

  it("scrubs allowlisted tag values too", () => {
    const result = scrubError(new Error("x"), { route: `/pay/${ADDRESS}` })
    expect(result.tags.route).not.toContain(ADDRESS)
  })
})
