import { describe, expect, it } from "vitest"
import { validateAndNormalizePayload } from "./validate"
import type { TxIntentPayload } from "./types"

// Addresses from the token registry used in tests
const USDC_CHAIN1 = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
// Valid checksummed address that is NOT the USDC address on chain 1
const USDC_CHAIN1_WRONG = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
const ADDR_A = "0x1234567890123456789012345678901234567890"
const ADDR_B = "0x0000000000000000000000000000000000000001"

function nativePayload(overrides?: Partial<TxIntentPayload>): TxIntentPayload {
  return {
    to: ADDR_A,
    from: ADDR_B,
    amount: "1.5",
    chainId: 1,
    token: { symbol: "ETH", type: "native", address: null, decimals: 18 },
    ...overrides,
  }
}

function erc20Payload(overrides?: Partial<TxIntentPayload>): TxIntentPayload {
  return {
    to: ADDR_A,
    from: ADDR_B,
    amount: "100",
    chainId: 1,
    token: { symbol: "USDC", type: "erc20", address: USDC_CHAIN1, decimals: 6 },
    ...overrides,
  }
}

describe("validateAndNormalizePayload", () => {
  describe("valid payloads", () => {
    it("accepts a valid native transfer", () => {
      expect(() => validateAndNormalizePayload(nativePayload())).not.toThrow()
    })

    it("accepts a valid erc20 transfer", () => {
      expect(() => validateAndNormalizePayload(erc20Payload())).not.toThrow()
    })

    it("accepts an erc20 transfer without token.address and fills it from registry", () => {
      const payload = erc20Payload({ token: { symbol: "USDC", type: "erc20", address: null, decimals: 6 } })
      validateAndNormalizePayload(payload)
      expect(payload.token.address).toBe(USDC_CHAIN1)
    })

    it("fills missing token.decimals from registry", () => {
      const payload = nativePayload()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(payload.token as any).decimals = undefined
      validateAndNormalizePayload(payload)
      expect(payload.token.decimals).toBe(18)
    })

    it("accepts amount with max valid decimal places for USDC (6)", () => {
      expect(() => validateAndNormalizePayload(erc20Payload({ amount: "0.000001" }))).not.toThrow()
    })

    it("accepts amount with fewer decimal places than token decimals", () => {
      expect(() => validateAndNormalizePayload(erc20Payload({ amount: "1.5" }))).not.toThrow()
    })
  })

  describe("address validation", () => {
    it("rejects invalid destination address", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ to: "not-an-address" })))
        .toThrow("Invalid destination address")
    })

    it("rejects missing destination address", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ to: "" })))
        .toThrow("Invalid destination address")
    })

    it("rejects invalid sender address", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ from: "0xbad" })))
        .toThrow("Invalid sender address")
    })

    it("rejects missing sender address", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ from: "" })))
        .toThrow("Invalid sender address")
    })
  })

  describe("amount validation", () => {
    it("rejects missing amount", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ amount: "" })))
        .toThrow("Amount is required")
    })

    it("rejects non-string amount", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateAndNormalizePayload(nativePayload({ amount: 100 as any })))
        .toThrow("Amount is required")
    })

    it("rejects zero amount", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ amount: "0" })))
        .toThrow("Amount must be positive")
    })

    it("rejects negative amount", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ amount: "-1" })))
        .toThrow("Amount must be positive")
    })

    it("rejects non-numeric amount string", () => {
      expect(() => validateAndNormalizePayload(nativePayload({ amount: "abc" })))
        .toThrow("Amount format is invalid")
    })
  })

  describe("chainId validation", () => {
    it("rejects missing chainId", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateAndNormalizePayload(nativePayload({ chainId: undefined as any })))
        .toThrow("Invalid chainId")
    })

    it("rejects non-number chainId", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateAndNormalizePayload(nativePayload({ chainId: "1" as any })))
        .toThrow("Invalid chainId")
    })
  })

  describe("token validation", () => {
    it("rejects missing token symbol", () => {
      expect(() => validateAndNormalizePayload(nativePayload({
        token: { symbol: "", type: "native", address: null, decimals: 18 },
      }))).toThrow("Invalid token")
    })

    it("rejects invalid token type", () => {
      expect(() => validateAndNormalizePayload(nativePayload({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token: { symbol: "ETH", type: "unknown" as any, address: null, decimals: 18 },
      }))).toThrow("Invalid token")
    })

    it("rejects token not in registry for given chain", () => {
      expect(() => validateAndNormalizePayload(nativePayload({
        token: { symbol: "SHIB", type: "erc20", address: ADDR_A, decimals: 18 },
      }))).toThrow("not supported on chain")
    })

    it("rejects token on unsupported chain", () => {
      expect(() => validateAndNormalizePayload(nativePayload({
        chainId: 9999,
        token: { symbol: "ETH", type: "native", address: null, decimals: 18 },
      }))).toThrow("not supported on chain")
    })

    it("rejects erc20 address that doesn't match registry", () => {
      expect(() => validateAndNormalizePayload(erc20Payload({
        token: { symbol: "USDC", type: "erc20", address: USDC_CHAIN1_WRONG, decimals: 6 },
      }))).toThrow("Token address does not match registry")
    })

    it("rejects malformed erc20 address", () => {
      expect(() => validateAndNormalizePayload(erc20Payload({
        token: { symbol: "USDC", type: "erc20", address: "0xBAD", decimals: 6 },
      }))).toThrow("Invalid token address")
    })

    it("rejects token.decimals mismatch with registry", () => {
      expect(() => validateAndNormalizePayload(erc20Payload({
        token: { symbol: "USDC", type: "erc20", address: USDC_CHAIN1, decimals: 18 },
      }))).toThrow("Token decimals do not match registry")
    })
  })
})
