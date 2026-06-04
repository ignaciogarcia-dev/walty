/**
 * Zodiac Roles Modifier — PRODUCTION wrapper end-to-end verification.
 *
 * Proves that the SHIPPING wrappers in `src/lib/zodiacRoles.ts` produce correct
 * on-chain behaviour against a Polygon mainnet fork (no inline re-encodings).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * PREREQUISITE: a local anvil fork of Polygon mainnet must already be running on 8546.
 * Start it with:
 *
 *   ~/.foundry/bin/anvil \
 *     --fork-url "https://polygon-mainnet.g.alchemy.com/v2/<KEY>" \
 *     --port 8546 --silent
 *
 * Run this script:
 *   pnpm -F @walty/api exec node --import tsx/esm scripts/polygon-fork-roles-verify.ts
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * The script uses anvil's deterministic dev accounts:
 *   account[0] = admin/owner (Safe owner + Roles owner)
 *   account[1] = manager     (assigned the manager role)
 *   account[2] = stranger    (no role)
 *
 * It only ever talks to http://127.0.0.1:8546 — never mainnet, never Supabase.
 */

import Safe from "@safe-global/protocol-kit"
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  getAddress,
  type Hex,
  type Address,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygon } from "viem/chains"

// ── PRODUCTION WRAPPERS (the whole point of this script) ─────────────────────
import {
  buildDeployModifierTx,
  parseDeployedModifier,
  buildEnableModuleData,
  buildScopeManagerCalls,
  buildAssignManagerTx,
  buildExecRefundTx,
} from "../src/lib/zodiacRoles.js"

// ── Constants ─────────────────────────────────────────────────────────────────
const RPC = "http://127.0.0.1:8546"

// anvil default dev accounts (deterministic mnemonic "test test ... junk")
const ACCOUNTS = {
  admin: {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
    pk: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex,
  },
  manager: {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    pk: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,
  },
  stranger: {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    pk: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex,
  },
}

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address // 6 decimals, Polygon
const USDC_WHALE = "0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245" as Address // from spike

const ONE_USDC = 1_000_000n // 6 decimals
const CAP = 100n * ONE_USDC // 100 USDC cap
const SAFE_FUNDING = 500n * ONE_USDC

// ── ABIs ──────────────────────────────────────────────────────────────────────
const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
])

const safeModuleAbi = parseAbi([
  "function isModuleEnabled(address module) view returns (bool)",
])

// ── Clients ───────────────────────────────────────────────────────────────────
const publicClient = createPublicClient({ chain: polygon, transport: http(RPC) })
const adminWallet = createWalletClient({
  account: privateKeyToAccount(ACCOUNTS.admin.pk),
  chain: polygon,
  transport: http(RPC),
})
const managerWallet = createWalletClient({
  account: privateKeyToAccount(ACCOUNTS.manager.pk),
  chain: polygon,
  transport: http(RPC),
})
const strangerWallet = createWalletClient({
  account: privateKeyToAccount(ACCOUNTS.stranger.pk),
  chain: polygon,
  transport: http(RPC),
})

// ── Helpers ───────────────────────────────────────────────────────────────────
async function send(
  wallet: typeof adminWallet,
  to: Address,
  data: Hex,
): Promise<void> {
  const hash = await wallet.sendTransaction({ to, data, chain: polygon })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`)
}

async function usdcBalance(addr: Address): Promise<bigint> {
  return publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr],
  })
}

const fmt = (v: bigint) => `${Number(v) / 1e6} USDC`

let pass = 0
let fail = 0
function assert(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass++
    console.log(`  PASS — ${label}${detail ? ` (${detail})` : ""}`)
  } else {
    fail++
    console.log(`  FAIL — ${label}${detail ? ` (${detail})` : ""}`)
  }
}

async function main() {
  console.log("== Zodiac Roles Modifier — PRODUCTION wrapper verification ==\n")
  console.log("Using production wrappers from src/lib/zodiacRoles.ts (NOT inline encodings)\n")

  // Sanity: fork is up and on the right chain
  const chainId = await publicClient.getChainId()
  if (chainId !== 137) throw new Error(`expected chain 137 (Polygon), got ${chainId}`)
  console.log(`fork chainId=${chainId} block=${await publicClient.getBlockNumber()}\n`)

  // ── 1. Deploy a 1-of-1 Safe owned by account[0] ──────────────────────────────
  console.log("[1] Deploying 1-of-1 Safe (owner = admin)…")
  const predictedSafe = {
    safeAccountConfig: { owners: [ACCOUNTS.admin.address], threshold: 1 },
    safeDeploymentConfig: { saltNonce: Date.now().toString(), safeVersion: "1.4.1" as const },
  }
  let protocolKit = await Safe.init({
    provider: RPC,
    signer: ACCOUNTS.admin.pk,
    predictedSafe,
  })
  const safeAddress = getAddress(await protocolKit.getAddress()) as Address
  const deployTx = await protocolKit.createSafeDeploymentTransaction()
  await send(adminWallet, deployTx.to as Address, deployTx.data as Hex)
  // Re-init connected to the now-deployed Safe
  protocolKit = await Safe.init({ provider: RPC, signer: ACCOUNTS.admin.pk, safeAddress })
  console.log(`    Safe = ${safeAddress}\n`)

  // ── 2. Deploy Roles Modifier via PRODUCTION wrapper ───────────────────────────
  console.log("[2] Deploying Roles Modifier proxy via buildDeployModifierTx()…")
  const deployPayload = buildDeployModifierTx({
    safeAddress,
    ownerAddress: ACCOUNTS.admin.address,
  })
  const deployHash = await adminWallet.sendTransaction({
    to: deployPayload.to,
    data: deployPayload.data,
    chain: polygon,
  })
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
  if (deployReceipt.status !== "success") throw new Error("deployModule reverted")

  // ── Parse modifier address via PRODUCTION wrapper ─────────────────────────────
  const rolesModifier = parseDeployedModifier(deployReceipt.logs) as Address
  console.log(`    Roles Modifier = ${rolesModifier}\n`)

  // ── 3. Enable module on the Safe via PRODUCTION wrapper ───────────────────────
  console.log("[3] Enabling module on Safe via buildEnableModuleData()…")
  const enableData = buildEnableModuleData(rolesModifier)
  // Wrap as a Safe tx executed by the owner
  const enableSafeTx = await protocolKit.createTransaction({
    transactions: [{ to: safeAddress, value: "0", data: enableData }],
  })
  const signedEnable = await protocolKit.signTransaction(enableSafeTx)
  const execEnable = await protocolKit.executeTransaction(signedEnable)
  await publicClient.waitForTransactionReceipt({ hash: execEnable.hash as Hex })

  const moduleEnabled = await publicClient.readContract({
    address: safeAddress,
    abi: safeModuleAbi,
    functionName: "isModuleEnabled",
    args: [rolesModifier],
  })
  if (!moduleEnabled) throw new Error("module not enabled after enableModule tx")
  console.log(`    isModuleEnabled = ${moduleEnabled}\n`)

  // ── 4. Scope manager role via PRODUCTION wrapper ──────────────────────────────
  console.log("[4] Scoping manager role via buildScopeManagerCalls()…")
  const scopeCalls = buildScopeManagerCalls({
    modifierAddress: rolesModifier,
    tokenAddress: USDC,
    capBaseUnits: CAP,
  })
  for (const call of scopeCalls) {
    await send(adminWallet, call.to, call.data)
  }
  console.log(`    ${scopeCalls.length} scope calls sent (cap=${fmt(CAP)})\n`)

  // ── 5. Assign manager role via PRODUCTION wrapper ─────────────────────────────
  console.log("[5] Assigning manager role via buildAssignManagerTx()…")
  const assignPayload = buildAssignManagerTx({
    modifierAddress: rolesModifier,
    managerAddress: ACCOUNTS.manager.address,
  })
  await send(adminWallet, assignPayload.to, assignPayload.data)
  console.log("    assigned\n")

  // ── 6. Fund the Safe with USDC via whale impersonation ────────────────────────
  console.log("[6] Funding Safe with USDC (impersonate whale)…")
  await publicClient.request({
    // @ts-expect-error anvil method
    method: "anvil_impersonateAccount",
    params: [USDC_WHALE],
  })
  await publicClient.request({
    // @ts-expect-error anvil method
    method: "anvil_setBalance",
    params: [USDC_WHALE, "0xde0b6b3a7640000"], // 1 ETH for gas
  })
  const fundData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [safeAddress, SAFE_FUNDING],
  })
  const fundHash = await publicClient.request({
    // @ts-expect-error anvil unlocked sender
    method: "eth_sendTransaction",
    params: [{ from: USDC_WHALE, to: USDC, data: fundData }],
  })
  await publicClient.waitForTransactionReceipt({ hash: fundHash as Hex })
  await publicClient.request({
    // @ts-expect-error anvil method
    method: "anvil_stopImpersonatingAccount",
    params: [USDC_WHALE],
  })
  const safeBal = await usdcBalance(safeAddress)
  console.log(`    Safe USDC balance = ${fmt(safeBal)}\n`)
  if (safeBal < SAFE_FUNDING) throw new Error("Safe funding failed")

  // ── Assertions using PRODUCTION buildExecRefundTx wrapper ─────────────────────
  const dest = ACCOUNTS.stranger.address // arbitrary recipient for the refund

  // ── ASSERTION A: manager refunds 40 USDC (≤ 100 cap) → succeeds ──────────────
  console.log("== ASSERTION A: manager refund 40 USDC (within cap) ==")
  {
    const amount = 40n * ONE_USDC
    const before = await usdcBalance(safeAddress)
    let ok = false
    try {
      const execPayload = buildExecRefundTx({
        modifierAddress: rolesModifier,
        tokenAddress: USDC,
        destination: dest,
        amountBaseUnits: amount,
      })
      await send(managerWallet, execPayload.to, execPayload.data)
      ok = true
    } catch (e) {
      console.log("    unexpected revert:", (e as Error).message.split("\n")[0])
    }
    const after = await usdcBalance(safeAddress)
    assert(
      "A: manager refund 40 USDC (within cap) succeeds and Safe balance drops by exactly 40",
      ok && before - after === amount,
      `before=${fmt(before)} after=${fmt(after)} delta=${fmt(before - after)}`,
    )
  }

  // ── ASSERTION B: manager refunds 80 USDC (60 remaining → reverts) ─────────────
  console.log("== ASSERTION B: manager refund 80 USDC (exceeds remaining 60 cap) ==")
  {
    const amount = 80n * ONE_USDC // 40 already spent, only 60 remain
    const before = await usdcBalance(safeAddress)
    let reverted = false
    try {
      const execPayload = buildExecRefundTx({
        modifierAddress: rolesModifier,
        tokenAddress: USDC,
        destination: dest,
        amountBaseUnits: amount,
      })
      await send(managerWallet, execPayload.to, execPayload.data)
    } catch {
      reverted = true
    }
    const after = await usdcBalance(safeAddress)
    assert(
      "B: manager refund 80 USDC (over remaining allowance) reverts, Safe balance unchanged",
      reverted && before === after,
      reverted ? "reverted as expected" : "did NOT revert",
    )
  }

  // ── ASSERTION C: stranger attempts exec → reverts (not a role member) ─────────
  console.log("== ASSERTION C: stranger attempts refund (no role) ==")
  {
    const amount = 10n * ONE_USDC // well within cap, but caller has no role
    const before = await usdcBalance(safeAddress)
    let reverted = false
    try {
      const execPayload = buildExecRefundTx({
        modifierAddress: rolesModifier,
        tokenAddress: USDC,
        destination: dest,
        amountBaseUnits: amount,
      })
      await send(strangerWallet, execPayload.to, execPayload.data)
    } catch {
      reverted = true
    }
    const after = await usdcBalance(safeAddress)
    assert(
      "C: stranger exec with manager roleKey reverts (not a role member), Safe balance unchanged",
      reverted && before === after,
      reverted ? "reverted as expected" : "did NOT revert",
    )
  }

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error("\nVERIFY ERROR:", e)
  process.exit(1)
})
