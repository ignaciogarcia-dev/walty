// apps/api/src/services/mpc/signature.ts
//
// Assemble an EVM-usable signature from the raw [R, S] output of the DKLS23
// combine() call.
//
// The DKLS23 `combine()` returns two 32-byte values [R, S] with no recovery id
// and no low-s guarantee.  This module:
//   1. Normalizes S to low-s (EIP-2).
//   2. Brute-forces the recovery id (yParity ∈ {0,1}) by calling viem
//      `recoverAddress` for each candidate and comparing against the known
//      signer address.
//   3. Returns a fully assembled EthSignature (r, s, v, yParity, serialized).
//
// NOTE: @noble/curves is not a direct dependency of this package — we use
// the secp256k1 order constant directly.  viem's `serializeSignature` and
// `recoverAddress` are used for all EC math.

import { recoverAddress, serializeSignature, type Hex } from "viem"

// ---------------------------------------------------------------------------
// secp256k1 constants — hardcoded, same value used throughout the codebase.
// Exported so sibling modules (e.g. MpcServerParty) can share the canonical
// value without duplicating it.
// ---------------------------------------------------------------------------

export const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EthSignature {
  /** 32-byte r component as 0x-prefixed hex. */
  r: Hex
  /** 32-byte s component (low-s normalized) as 0x-prefixed hex. */
  s: Hex
  /** Legacy v value: 27 or 28. */
  v: 27 | 28
  /** yParity: 0 (v=27) or 1 (v=28). */
  yParity: 0 | 1
  /**
   * Standard 65-byte EVM signature encoding: r(32) || s(32) || v(1).
   * Suitable for on-chain use or RPC submission.
   */
  serialized: Hex
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a Uint8Array to a 0x-prefixed lowercase hex string. */
function bytesToHex(u: Uint8Array): Hex {
  return ("0x" +
    Array.from(u)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex
}

/** Convert a Hex or Uint8Array to a 32-byte Hex value padded on the left. */
function toHex32(value: Uint8Array | Hex): Hex {
  if (typeof value === "string") {
    // Strip 0x and left-pad to 64 hex chars (32 bytes)
    const stripped = value.startsWith("0x") ? value.slice(2) : value
    return ("0x" + stripped.padStart(64, "0")) as Hex
  }
  return bytesToHex(value)
}

/** Convert a Hex or Uint8Array to BigInt. */
function toBigInt(value: Uint8Array | Hex): bigint {
  const hex = toHex32(value)
  return BigInt(hex)
}

// ---------------------------------------------------------------------------
// assembleEthSignature
// ---------------------------------------------------------------------------

/**
 * Assemble an EVM signature from raw MPC [R, S] over a 32-byte message hash.
 *
 * Steps:
 *   1. Normalize S to low-s (EIP-2): if s > n/2, use s = n − s.
 *   2. Brute-force yParity ∈ {0, 1}: for each, call `recoverAddress` and
 *      compare against `expectedAddress` (case-insensitive).
 *   3. Return r, s (normalized), v (27 or 28), yParity, and the 65-byte
 *      serialized signature.
 *
 * @throws If neither yParity recovers `expectedAddress`.
 */
export async function assembleEthSignature(args: {
  r: Uint8Array | Hex
  s: Uint8Array | Hex
  hash: Hex
  /** Ethereum address of the expected signer.  Accepts both `Hex` (`0x${string}`) and plain `string`. */
  expectedAddress: Hex | string
}): Promise<EthSignature> {
  const { hash, expectedAddress } = args

  // Step 1 — low-s normalization
  const rHex = toHex32(args.r)
  let sBig = toBigInt(args.s)
  if (sBig > HALF_N) sBig = SECP256K1_N - sBig

  const sHex = ("0x" + sBig.toString(16).padStart(64, "0")) as Hex

  // Step 2 — brute-force yParity
  for (const yParity of [0, 1] as const) {
    let recovered: string
    try {
      recovered = await recoverAddress({
        hash,
        signature: { r: rHex, s: sHex, yParity },
      })
    } catch {
      // This parity value produced an invalid point; try the other one
      continue
    }

    if (recovered.toLowerCase() === expectedAddress.toLowerCase()) {
      const v = (yParity === 0 ? 27 : 28) as 27 | 28
      const serialized = serializeSignature({ r: rHex, s: sHex, yParity })
      return { r: rHex, s: sHex, v, yParity, serialized }
    }
  }

  throw new Error(
    `assembleEthSignature: could not recover expected address ${expectedAddress} from signature — ` +
      `neither yParity=0 nor yParity=1 matched`,
  )
}
