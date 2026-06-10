// Pure, WASM-free pieces of the device party: the bundle wire codec (must stay
// byte-identical to the server's, or device and server desync mid-ceremony) and
// the compressed-pubkey -> Ethereum address derivation (the address funds land
// on). The DKLS state machines need the WASM module and are exercised by the
// e2e ceremony tests; here we pin the deterministic crypto/serialization.

import { describe, it, expect } from "vitest"
import { privateKeyToAccount } from "viem/accounts"
import { hexToBytes } from "viem"
import {
  encodeBundle,
  decodeBundle,
  compressedPubkeyToAddress,
} from "./MpcDeviceParty"

describe("bundle codec", () => {
  it("round-trips an empty bundle", () => {
    expect(decodeBundle(encodeBundle([]))).toEqual([])
  })

  it("round-trips frames with arbitrary bytes (incl. 0x00 and 0xff)", () => {
    const frames = [
      new Uint8Array([0, 1, 255, 254, 0, 127, 128]),
      new Uint8Array([1, 255]),
      new Uint8Array([2, 254, 42, 42, 42]),
    ]
    const decoded = decodeBundle(encodeBundle(frames))
    expect(decoded).toHaveLength(3)
    decoded.forEach((f, i) => expect(Array.from(f)).toEqual(Array.from(frames[i])))
  })

  it("preserves a 512-byte high-entropy frame", () => {
    const frame = new Uint8Array(512).map((_, i) => (i * 31 + 7) % 256)
    const [decoded] = decodeBundle(encodeBundle([frame]))
    expect(Array.from(decoded)).toEqual(Array.from(frame))
  })

  it("rejects a non-base64 / malformed payload", () => {
    expect(() => decodeBundle("!!!not base64!!!")).toThrow(/invalid bundle payload/)
  })

  it("rejects a payload that isn't a JSON array of strings", () => {
    const notArray = btoa(JSON.stringify({ nope: true }))
    expect(() => decodeBundle(notArray)).toThrow(/array of strings/)
    const arrayOfNumbers = btoa(JSON.stringify([1, 2, 3]))
    expect(() => decodeBundle(arrayOfNumbers)).toThrow(/array of strings/)
  })
})

describe("compressedPubkeyToAddress", () => {
  // Known accounts (Anvil-style). Each derives a compressed pubkey from viem's
  // uncompressed publicKey and asserts the decompression recovers the address.
  const KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  ] as const

  for (const pk of KEYS) {
    it(`derives the address for key ${pk.slice(0, 10)}…`, () => {
      const account = privateKeyToAccount(pk)
      const pub = hexToBytes(account.publicKey) // 65 bytes: 0x04 | X(32) | Y(32)
      expect(pub.length).toBe(65)
      const x = pub.slice(1, 33)
      const y = pub.slice(33, 65)
      const prefix = (y[31] & 1) === 1 ? 0x03 : 0x02 // odd Y -> 0x03
      const compressed = new Uint8Array([prefix, ...x])

      expect(compressedPubkeyToAddress(compressed)).toBe(account.address)
    })
  }

  it("rejects a wrong-length compressed key", () => {
    expect(() => compressedPubkeyToAddress(new Uint8Array(32))).toThrow(/33 bytes/)
  })
})
