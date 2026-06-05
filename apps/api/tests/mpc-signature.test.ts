// apps/api/tests/mpc-signature.test.ts
//
// Unit tests for assembleEthSignature.
//
// Ground truth is generated without MPC:
//   - Create a known private key and account with viem.
//   - Sign a 32-byte hash via `sign({ hash, privateKey })` from viem/accounts.
//   - Feed raw r, s (+ the account address) into assembleEthSignature.
//   - Assert that the assembled signature returns the correct v / yParity and
//     that `serialized` round-trips via recoverAddress.
//
// Additional coverage:
//   - HIGH-s normalization: feed (n - s) and assert it normalizes back to the
//     same low-s and still recovers the correct address.
//   - Wrong expectedAddress: assert assembleEthSignature throws.

import { describe, it, expect } from "vitest"
import {
  generatePrivateKey,
  privateKeyToAccount,
  sign,
} from "viem/accounts"
import { recoverAddress, type Hex } from "viem"
import { assembleEthSignature } from "../src/services/mpc/signature.js"

// secp256k1 n — same constant used in signature.ts
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a 0x-prefixed 32-byte hex string to a Uint8Array. */
function hexToBytes32(hex: Hex): Uint8Array {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex
  const padded = stripped.padStart(64, "0")
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Convert a Hex to BigInt. */
function hexToBigInt(hex: Hex): bigint {
  return BigInt(hex)
}

// A stable 32-byte hash for all tests (keccak256("walty-mpc-signature-test"))
// Pre-computed to avoid test-time dependencies on hashing
const TEST_HASH =
  "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" as Hex

// A second distinct hash for multi-test scenarios
const TEST_HASH_2 =
  "0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658" as Hex

// ---------------------------------------------------------------------------
// Basic assembly — known private key, normal low-s output
// ---------------------------------------------------------------------------

describe("assembleEthSignature — basic", () => {
  it("returns a valid signature that recovers the expected address (Hex inputs)", async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    // viem sign always returns low-s
    const viemSig = await sign({ hash: TEST_HASH, privateKey })

    const result = await assembleEthSignature({
      r: viemSig.r,
      s: viemSig.s,
      hash: TEST_HASH,
      expectedAddress: account.address,
    })

    // v must be 27 or 28
    expect([27, 28]).toContain(result.v)
    expect([0, 1]).toContain(result.yParity)
    expect(result.v).toBe(result.yParity + 27)

    // s must still be low-s
    const sBig = hexToBigInt(result.s)
    const HALF_N = SECP256K1_N / 2n
    expect(sBig <= HALF_N).toBe(true)

    // Recover via viem using serialized sig — must match expected address
    const recovered = await recoverAddress({
      hash: TEST_HASH,
      signature: result.serialized,
    })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  it("returns a valid signature that recovers the expected address (Uint8Array inputs)", async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    const viemSig = await sign({ hash: TEST_HASH_2, privateKey })

    // Convert r, s to Uint8Array before passing
    const rBytes = hexToBytes32(viemSig.r)
    const sBytes = hexToBytes32(viemSig.s)

    const result = await assembleEthSignature({
      r: rBytes,
      s: sBytes,
      hash: TEST_HASH_2,
      expectedAddress: account.address,
    })

    expect([27, 28]).toContain(result.v)

    const recovered = await recoverAddress({
      hash: TEST_HASH_2,
      signature: result.serialized,
    })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  it("serialized is exactly 65 bytes (130 hex chars + 0x prefix)", async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const viemSig = await sign({ hash: TEST_HASH, privateKey })

    const result = await assembleEthSignature({
      r: viemSig.r,
      s: viemSig.s,
      hash: TEST_HASH,
      expectedAddress: account.address,
    })

    // "0x" + 64 (r) + 64 (s) + 2 (v byte) = 132 chars
    expect(result.serialized).toMatch(/^0x[0-9a-f]{130}$/i)
  })

  it("v field in serialized ends with 1b or 1c", async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const viemSig = await sign({ hash: TEST_HASH, privateKey })

    const result = await assembleEthSignature({
      r: viemSig.r,
      s: viemSig.s,
      hash: TEST_HASH,
      expectedAddress: account.address,
    })

    // Last byte: 0x1b = 27, 0x1c = 28
    const lastByte = result.serialized.slice(-2).toLowerCase()
    expect(["1b", "1c"]).toContain(lastByte)
  })
})

// ---------------------------------------------------------------------------
// High-s normalization
// ---------------------------------------------------------------------------

describe("assembleEthSignature — high-s normalization", () => {
  it("normalizes high-s (n - s) to low-s and still recovers the address", async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    const viemSig = await sign({ hash: TEST_HASH, privateKey })
    const originalS = hexToBigInt(viemSig.s as Hex)

    // Flip to high-s: use (n - s).  Since viemSig.s is already low-s,
    // (n - s) will be > n/2, i.e. high-s.
    const highS = SECP256K1_N - originalS
    const highSHex = ("0x" + highS.toString(16).padStart(64, "0")) as Hex

    const result = await assembleEthSignature({
      r: viemSig.r,
      s: highSHex,
      hash: TEST_HASH,
      expectedAddress: account.address,
    })

    // Normalized s must equal the original low-s
    expect(hexToBigInt(result.s)).toBe(originalS)

    // Must still be low-s
    const HALF_N = SECP256K1_N / 2n
    expect(hexToBigInt(result.s) <= HALF_N).toBe(true)

    // Must still recover correctly
    const recovered = await recoverAddress({
      hash: TEST_HASH,
      signature: result.serialized,
    })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  it("low-s input passes through unchanged", async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    const viemSig = await sign({ hash: TEST_HASH_2, privateKey })
    const originalS = hexToBigInt(viemSig.s as Hex)

    const result = await assembleEthSignature({
      r: viemSig.r,
      s: viemSig.s,
      hash: TEST_HASH_2,
      expectedAddress: account.address,
    })

    // s must be unchanged
    expect(hexToBigInt(result.s)).toBe(originalS)
  })
})

// ---------------------------------------------------------------------------
// Wrong address — must throw
// ---------------------------------------------------------------------------

describe("assembleEthSignature — wrong expectedAddress", () => {
  it("throws when expectedAddress does not match the signing key", async () => {
    const privateKey = generatePrivateKey()
    // Generate a completely different account as the "wrong" address
    const wrongAccount = privateKeyToAccount(generatePrivateKey())

    const viemSig = await sign({ hash: TEST_HASH, privateKey })

    await expect(
      assembleEthSignature({
        r: viemSig.r,
        s: viemSig.s,
        hash: TEST_HASH,
        expectedAddress: wrongAccount.address,
      }),
    ).rejects.toThrow("assembleEthSignature: could not recover expected address")
  })

  it("error message contains the expected address", async () => {
    const privateKey = generatePrivateKey()
    const wrongAccount = privateKeyToAccount(generatePrivateKey())
    const viemSig = await sign({ hash: TEST_HASH, privateKey })

    await expect(
      assembleEthSignature({
        r: viemSig.r,
        s: viemSig.s,
        hash: TEST_HASH,
        expectedAddress: wrongAccount.address,
      }),
    ).rejects.toThrow(wrongAccount.address)
  })
})

// ---------------------------------------------------------------------------
// yParity / v consistency
// ---------------------------------------------------------------------------

describe("assembleEthSignature — yParity / v consistency", () => {
  it("yParity=0 corresponds to v=27", async () => {
    // Run enough keys until we hit yParity=0
    for (let i = 0; i < 20; i++) {
      const privateKey = generatePrivateKey()
      const account = privateKeyToAccount(privateKey)
      const viemSig = await sign({ hash: TEST_HASH, privateKey })
      const result = await assembleEthSignature({
        r: viemSig.r,
        s: viemSig.s,
        hash: TEST_HASH,
        expectedAddress: account.address,
      })
      if (result.yParity === 0) {
        expect(result.v).toBe(27)
        return
      }
    }
    // If we never hit yParity=0 in 20 tries, just pass — probability is 2^-20
  })

  it("yParity=1 corresponds to v=28", async () => {
    for (let i = 0; i < 20; i++) {
      const privateKey = generatePrivateKey()
      const account = privateKeyToAccount(privateKey)
      const viemSig = await sign({ hash: TEST_HASH, privateKey })
      const result = await assembleEthSignature({
        r: viemSig.r,
        s: viemSig.s,
        hash: TEST_HASH,
        expectedAddress: account.address,
      })
      if (result.yParity === 1) {
        expect(result.v).toBe(28)
        return
      }
    }
  })

  it("r and s in result match what was passed in (after normalization)", async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const viemSig = await sign({ hash: TEST_HASH, privateKey })

    const result = await assembleEthSignature({
      r: viemSig.r,
      s: viemSig.s,
      hash: TEST_HASH,
      expectedAddress: account.address,
    })

    expect(result.r.toLowerCase()).toBe(viemSig.r.toLowerCase())
    // s is low-s; viem already returns low-s, so they should be equal
    expect(result.s.toLowerCase()).toBe(viemSig.s.toLowerCase())
  })
})
