// DKLS23 combine() returns raw [R, S] with no recovery id and no low-s
// guarantee. Here we low-s normalize S (EIP-2) and brute-force yParity ∈ {0,1}
// via viem recoverAddress against the known signer, then assemble an
// EthSignature. No @noble/curves dep — secp256k1 order is inlined, viem does the EC math.

import { recoverAddress, serializeSignature, type Hex } from "viem"

// Exported so siblings (e.g. MpcServerParty) share the canonical value.
export const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n

export interface EthSignature {
  r: Hex
  /** low-s normalized. */
  s: Hex
  v: 27 | 28
  yParity: 0 | 1
  /** 65-byte r(32) || s(32) || v(1). */
  serialized: Hex
}

function bytesToHex(u: Uint8Array): Hex {
  return ("0x" +
    Array.from(u)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex
}

function toHex32(value: Uint8Array | Hex): Hex {
  if (typeof value === "string") {
    const stripped = value.startsWith("0x") ? value.slice(2) : value
    return ("0x" + stripped.padStart(64, "0")) as Hex
  }
  return bytesToHex(value)
}

function toBigInt(value: Uint8Array | Hex): bigint {
  const hex = toHex32(value)
  return BigInt(hex)
}

// Assemble an EVM signature from raw MPC [R, S]: low-s normalize (EIP-2, s = n−s
// if s > n/2), then brute-force yParity ∈ {0,1} against expectedAddress.
// Throws if neither parity recovers expectedAddress.
export async function assembleEthSignature(args: {
  r: Uint8Array | Hex
  s: Uint8Array | Hex
  hash: Hex
  expectedAddress: Hex | string
}): Promise<EthSignature> {
  const { hash, expectedAddress } = args

  const rHex = toHex32(args.r)
  let sBig = toBigInt(args.s)
  if (sBig > HALF_N) sBig = SECP256K1_N - sBig

  const sHex = ("0x" + sBig.toString(16).padStart(64, "0")) as Hex

  for (const yParity of [0, 1] as const) {
    let recovered: string
    try {
      recovered = await recoverAddress({
        hash,
        signature: { r: rHex, s: sHex, yParity },
      })
    } catch {
      // invalid point for this parity; try the other
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
