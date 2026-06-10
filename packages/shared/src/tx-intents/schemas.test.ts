import { describe, expect, it } from "vitest"
import {
  createTxIntentBody,
  patchTxIntentBody,
  signTxIntentBody,
  txIntentPayloadSchema,
} from "./schemas"

const ADDR_A = "0x" + "1".repeat(40)
const ADDR_B = "0x" + "2".repeat(40)
const ADDR_T = "0x" + "3".repeat(40)

const validPayload = {
  to: ADDR_A,
  from: ADDR_B,
  amount: "1.5",
  chainId: 137,
  token: { symbol: "USDC", address: ADDR_T, type: "erc20", decimals: 6 },
}

describe("txIntentPayloadSchema", () => {
  it("accepts a complete erc20 payload", () => {
    expect(txIntentPayloadSchema.parse(validPayload)).toMatchObject(validPayload)
  })

  it("accepts a native payload with a null token address", () => {
    const native = {
      ...validPayload,
      token: { symbol: "POL", address: null, type: "native", decimals: 18 },
    }
    expect(() => txIntentPayloadSchema.parse(native)).not.toThrow()
  })

  it("rejects a missing destination address", () => {
    const { to, ...rest } = validPayload
    expect(() => txIntentPayloadSchema.parse(rest)).toThrow()
  })

  it("rejects a malformed address", () => {
    expect(() =>
      txIntentPayloadSchema.parse({ ...validPayload, to: "not-an-address" }),
    ).toThrow()
  })

  it("rejects a non-string amount", () => {
    expect(() =>
      txIntentPayloadSchema.parse({ ...validPayload, amount: 1.5 }),
    ).toThrow()
  })

  it("rejects an empty amount", () => {
    expect(() =>
      txIntentPayloadSchema.parse({ ...validPayload, amount: "" }),
    ).toThrow()
  })

  it("rejects a non-positive chainId", () => {
    expect(() =>
      txIntentPayloadSchema.parse({ ...validPayload, chainId: 0 }),
    ).toThrow()
  })

  it("rejects an unknown token type", () => {
    expect(() =>
      txIntentPayloadSchema.parse({
        ...validPayload,
        token: { ...validPayload.token, type: "nft" },
      }),
    ).toThrow()
  })

  it("strips unknown keys from the payload", () => {
    const parsed = txIntentPayloadSchema.parse({ ...validPayload, foo: "bar" })
    expect(parsed).not.toHaveProperty("foo")
  })
})

describe("createTxIntentBody", () => {
  it("accepts a payload and defaults type to transfer", () => {
    const parsed = createTxIntentBody.parse({ payload: validPayload })
    expect(parsed.type).toBe("transfer")
  })

  it("accepts a valid explicit type and idempotency key", () => {
    const parsed = createTxIntentBody.parse({
      payload: validPayload,
      type: "refund",
      idempotencyKey: "abc-123",
    })
    expect(parsed.type).toBe("refund")
    expect(parsed.idempotencyKey).toBe("abc-123")
  })

  it("rejects an unknown intent type", () => {
    expect(() =>
      createTxIntentBody.parse({ payload: validPayload, type: "bogus" }),
    ).toThrow()
  })

  it("rejects a missing payload", () => {
    expect(() => createTxIntentBody.parse({ type: "transfer" })).toThrow()
  })
})

describe("patchTxIntentBody", () => {
  it("accepts confirmed and failed", () => {
    expect(patchTxIntentBody.parse({ status: "confirmed" }).status).toBe(
      "confirmed",
    )
    expect(patchTxIntentBody.parse({ status: "failed" }).status).toBe("failed")
  })

  it("rejects any other status", () => {
    expect(() => patchTxIntentBody.parse({ status: "pending" })).toThrow()
    expect(() => patchTxIntentBody.parse({})).toThrow()
  })
})

describe("signTxIntentBody", () => {
  it("accepts 0x-prefixed even-length hex", () => {
    expect(() =>
      signTxIntentBody.parse({ signedRaw: "0x02f86b0182" }),
    ).not.toThrow()
  })

  it("rejects non-hex", () => {
    expect(() => signTxIntentBody.parse({ signedRaw: "not-hex" })).toThrow()
  })

  it("rejects odd-length hex", () => {
    expect(() => signTxIntentBody.parse({ signedRaw: "0x123" })).toThrow()
  })

  it("rejects a missing signedRaw", () => {
    expect(() => signTxIntentBody.parse({})).toThrow()
  })
})
