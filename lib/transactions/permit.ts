/**
 * permit.ts
 *
 * EIP-2612 permit signature — builder (client) + verifier (server).
 *
 * USDC on Polygon (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) supports permit().
 * USDT on Polygon does NOT — falls back to standard approve() flow (future work).
 */

import {
  hexToBytes,
  bytesToHex,
  type WalletClient,
  type PublicClient,
} from "viem"

// ── Constants ──────────────────────────────────────────────────────────────────

export const USDC_POLYGON         = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const
export const USDC_POLYGON_DECIMALS = 6
export const PERMIT_TTL_SEC        = 300 // 5 min — default deadline

export const PERMIT_ABI = [
  {
    name: "permit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner",    type: "address" },
      { name: "spender",  type: "address" },
      { name: "value",    type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v",        type: "uint8"   },
      { name: "r",        type: "bytes32" },
      { name: "s",        type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "owner", type: "address" }],
    outputs: [{ name: "",      type: "uint256" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "version",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "string" }],
  },
] as const

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Permit data returned from signPermit().
 * bigints are kept as bigints — stringify before JSON transport.
 */
export type PermitSignature = {
  owner:    `0x${string}`
  spender:  `0x${string}`
  value:    bigint
  deadline: bigint
  nonce:    bigint
  v: number
  r: `0x${string}`
  s: `0x${string}`
  chainId:  number
  token:    `0x${string}`
}

// ── Client: build + sign ───────────────────────────────────────────────────────

/**
 * Signs an EIP-2612 permit in the browser.
 * Zero gas cost — the user signs a typed message, not a transaction.
 *
 * @param walletClient    viem WalletClient backed by the user's key
 * @param publicClient    viem PublicClient to read nonce from chain
 * @param tokenAddress    ERC-20 token address (must support EIP-2612)
 * @param tokenName       Token name (used in EIP-712 domain)
 * @param chainId         Network chain ID
 * @param owner           Token holder address
 * @param spender         Address allowed to spend (sponsor wallet)
 * @param value           Amount in token base units (bigint)
 * @param deadlineSeconds Seconds from now until the permit expires (default 1200)
 */
export async function signPermit({
  walletClient,
  publicClient,
  tokenAddress,
  tokenName,
  chainId,
  owner,
  spender,
  value,
  deadlineSeconds = 1200,
}: {
  walletClient:    WalletClient
  publicClient:    PublicClient
  tokenAddress:    `0x${string}`
  tokenName:       string
  chainId:         number
  owner:           `0x${string}`
  spender:         `0x${string}`
  value:           bigint
  deadlineSeconds?: number
}): Promise<PermitSignature> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds)

  const [nonce, version] = await Promise.all([
    publicClient.readContract({
      address:      tokenAddress,
      abi:          PERMIT_ABI,
      functionName: "nonces",
      args:         [owner],
    }),
    publicClient.readContract({
      address:      tokenAddress,
      abi:          PERMIT_ABI,
      functionName: "version",
    }).catch(() => "1"), // tokens without version() default to "1"
  ])

  // Use walletClient.account (LocalAccount) — not the address string.
  // Passing an address string makes viem call eth_signTypedData_v4 on the RPC,
  // which public nodes don't support. LocalAccount signs in-browser, no RPC needed.
  const signature = await walletClient.signTypedData({
    account:     walletClient.account!,
    domain: {
      name:              tokenName,
      version,
      chainId,
      verifyingContract: tokenAddress,
    },
    types: {
      Permit: [
        { name: "owner",    type: "address" },
        { name: "spender",  type: "address" },
        { name: "value",    type: "uint256" },
        { name: "nonce",    type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message:     { owner, spender, value, nonce, deadline },
  })

  const { v, r, s } = splitSignature(signature)

  return {
    owner,
    spender,
    value,
    deadline,
    nonce,
    v, r, s,
    chainId,
    token: tokenAddress,
  }
}

// ── Server: verify before spending gas ────────────────────────────────────────

/**
 * Lightweight pre-flight checks before relaying.
 * Full cryptographic verification happens on-chain inside permit().
 * Throws on any invalid field so the relay fails fast before touching gas.
 */
export function verifyPermit(
  permit: { spender: string; value: bigint | string; deadline: bigint | string },
  expectedSpender: `0x${string}`,
): void {
  if (BigInt(permit.value) <= 0n) {
    throw new Error("Invalid permit: value must be > 0")
  }

  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  if (BigInt(permit.deadline) < nowSec) {
    throw new Error("Permit expired")
  }

  if (permit.spender.toLowerCase() !== expectedSpender.toLowerCase()) {
    throw new Error(
      `Permit spender mismatch: expected ${expectedSpender}, got ${permit.spender}`,
    )
  }
}

// ── Fee math ───────────────────────────────────────────────────────────────────

/** Fee taken from a gross amount (e.g. 100 bps = 1%). */
export function calcFeeAmount(grossRaw: bigint, feeBps: number): bigint {
  return (grossRaw * BigInt(feeBps)) / 10_000n
}

/** Net amount after fee deduction. */
export function calcNetAmount(grossRaw: bigint, feeBps: number): bigint {
  return grossRaw - calcFeeAmount(grossRaw, feeBps)
}

/**
 * Gross amount required so the recipient receives exactly netRaw.
 * gross = net * 10000 / (10000 - feeBps)
 */
export function calcGrossFromNet(netRaw: bigint, feeBps: number): bigint {
  return (netRaw * 10_000n) / BigInt(10_000 - feeBps)
}

// ── Utilities ──────────────────────────────────────────────────────────────────

/** Splits a 65-byte hex signature into { v, r, s }. */
export function splitSignature(sig: `0x${string}`): {
  v: number
  r: `0x${string}`
  s: `0x${string}`
} {
  const bytes = hexToBytes(sig)
  if (bytes.length !== 65) throw new Error("Invalid signature length")

  const r = bytesToHex(bytes.slice(0, 32))  as `0x${string}`
  const s = bytesToHex(bytes.slice(32, 64)) as `0x${string}`
  let v   = bytes[64]
  if (v < 27) v += 27 // normalize: some signers return 0/1 instead of 27/28

  return { v, r, s }
}

/**
 * Returns true if the token exposes the EIP-2612 nonces() function.
 * Quick check — does not guarantee the full permit() spec is correct.
 */
export async function supportsPermit(
  tokenAddress: `0x${string}`,
  publicClient: PublicClient,
): Promise<boolean> {
  try {
    await publicClient.readContract({
      address:      tokenAddress,
      abi:          PERMIT_ABI,
      functionName: "nonces",
      args:         ["0x0000000000000000000000000000000000000001"],
    })
    return true
  } catch {
    return false
  }
}
