/**
 * Manual Amoy Safe smoke test — NOT part of CI.
 *
 * Prediction-only run (no gas, no private key needed):
 *   SMOKE_OWNER=0x<address> pnpm -F @walty/api exec node --import tsx/esm scripts/amoy-safe-smoke.ts
 *
 * Full deploy run (requires a funded Amoy EOA):
 *   1. Fund an Amoy EOA from https://faucet.polygon.technology/ (select "Polygon Amoy")
 *   2. Export its private key as SAFE_DEPLOYER_PRIVATE_KEY
 *   SMOKE_OWNER=0x<address> SAFE_DEPLOYER_PRIVATE_KEY=0x<key> \
 *     pnpm -F @walty/api exec node --import tsx/esm scripts/amoy-safe-smoke.ts
 */

import { predictSafeAddress, deploySafe } from "../src/lib/safe.js"

const owner = process.env.SMOKE_OWNER as string
const deployer = process.env.SAFE_DEPLOYER_PRIVATE_KEY as string

if (!owner) throw new Error("Set SMOKE_OWNER to a 0x owner address")

// saltNonce must be a numeric string (Protocol Kit converts it with BigInt())
const SALT_NONCE = "1"

const predicted = await predictSafeAddress({ ownerAddress: owner, chainId: 80002, saltNonce: SALT_NONCE })
console.log("predicted:", predicted)

if (!deployer) {
  console.log("No SAFE_DEPLOYER_PRIVATE_KEY set — skipping deploy (prediction-only run).")
  process.exit(0)
}

const res = await deploySafe({ ownerAddress: owner, chainId: 80002, saltNonce: SALT_NONCE, deployerPrivateKey: deployer })
console.log("deployed:", res)
if (res.safeAddress.toLowerCase() !== predicted.toLowerCase()) {
  throw new Error("predicted address != deployed address")
}
console.log("OK: predicted == deployed")
