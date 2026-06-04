/**
 * Zodiac Roles Modifier — Polygon mainnet fork spike.
 *
 * Proves that a `manager` operator can move USDC out of a business Safe ONLY via an
 * on-chain-capped Zodiac Roles allowance, while an over-cap call and an unauthorized
 * account both revert.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * PREREQUISITE: a local anvil fork of Polygon mainnet must already be running on 8546.
 * Start it (reads ALCHEMY_API_KEY from the repo root .env) with:
 *
 *   KEY=$(grep -E '^ALCHEMY_API_KEY=' .env | cut -d= -f2- | tr -d '"'"'"' ')
 *   ~/.foundry/bin/anvil \
 *     --fork-url "https://polygon-mainnet.g.alchemy.com/v2/$KEY" \
 *     --port 8546 --silent &
 *
 * Run this script:
 *   pnpm -F @walty/api exec node --import tsx/esm scripts/polygon-fork-roles-spike.ts
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
  encodeAbiParameters,
  parseAbi,
  parseEventLogs,
  getAddress,
  type Hex,
  type Address,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygon } from "viem/chains"
import {
  processPermissions,
  flattenCondition,
  c,
  encodeKey,
  rolesAbi,
  ExecutionOptions,
  type ConditionFlat,
} from "zodiac-roles-sdk"

// ── Constants ────────────────────────────────────────────────────────────────
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

// Canonical on-chain Polygon deployments (verified to have bytecode on the fork)
const MODULE_PROXY_FACTORY = "0x000000000000aDdB49795b0f9bA5BC298cDda236" as Address
const ROLES_MASTERCOPY = "0x9646fDAD06d3e24444381f44362a3B0eB343D337" as Address // Roles v2.1

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address // 6 decimals
const USDC_WHALE = "0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245" as Address

const ROLE_KEY = encodeKey("manager")
const ALLOWANCE_KEY = encodeKey("usdc-cap")

const ONE_USDC = 1_000_000n // 6 decimals
const CAP = 100n * ONE_USDC // 100 USDC allowance cap
const SAFE_FUNDING = 500n * ONE_USDC // fund the Safe with 500 USDC

// ── ABIs ─────────────────────────────────────────────────────────────────────
const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
])

const factoryAbi = parseAbi([
  "function deployModule(address mastercopy, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ModuleProxyCreation(address indexed proxy, address indexed masterCopy)",
])

const safeModuleAbi = parseAbi([
  "function enableModule(address module)",
  "function isModuleEnabled(address module) view returns (bool)",
])

// ── Clients ──────────────────────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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
  console.log("== Zodiac Roles Modifier — Polygon fork spike ==\n")

  // sanity: fork is up
  const chainId = await publicClient.getChainId()
  if (chainId !== 137) throw new Error(`expected chain 137, got ${chainId}`)
  console.log(`fork chainId=${chainId} block=${await publicClient.getBlockNumber()}\n`)

  // ── 1. Deploy a 1-of-1 Safe owned by admin ──────────────────────────────────
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
  const safeAddress = getAddress(await protocolKit.getAddress())
  const deployTx = await protocolKit.createSafeDeploymentTransaction()
  await send(adminWallet, deployTx.to as Address, deployTx.data as Hex)
  // re-init connected to the now-deployed Safe
  protocolKit = await Safe.init({ provider: RPC, signer: ACCOUNTS.admin.pk, safeAddress })
  console.log(`    Safe = ${safeAddress}\n`)

  // ── 2. Deploy a Roles Modifier proxy via ModuleProxyFactory ─────────────────
  console.log("[2] Deploying Roles Modifier proxy…")
  // Roles.setUp(initParams) where initParams = abi.encode(owner, avatar, target)
  const initParams = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }],
    [ACCOUNTS.admin.address, safeAddress, safeAddress],
  )
  const setUpData = encodeFunctionData({
    abi: rolesAbi,
    functionName: "setUp",
    args: [initParams],
  })
  const saltNonce = BigInt(Date.now())
  const deployModuleData = encodeFunctionData({
    abi: factoryAbi,
    functionName: "deployModule",
    args: [ROLES_MASTERCOPY, setUpData, saltNonce],
  })
  const deployHash = await adminWallet.sendTransaction({
    to: MODULE_PROXY_FACTORY,
    data: deployModuleData,
    chain: polygon,
  })
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
  if (deployReceipt.status !== "success") throw new Error("deployModule reverted")
  // recover the proxy address from the ModuleProxyCreation event
  const creationLogs = parseEventLogs({
    abi: factoryAbi,
    eventName: "ModuleProxyCreation",
    logs: deployReceipt.logs,
  })
  if (creationLogs.length === 0) throw new Error("no ModuleProxyCreation log")
  const rolesModifier = getAddress(creationLogs[0].args.proxy)
  console.log(`    Roles Modifier = ${rolesModifier}\n`)

  // ── 3. Enable the module on the Safe ────────────────────────────────────────
  console.log("[3] Enabling module on the Safe…")
  const enableData = encodeFunctionData({
    abi: safeModuleAbi,
    functionName: "enableModule",
    args: [rolesModifier],
  })
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
  if (!moduleEnabled) throw new Error("module not enabled")
  console.log(`    isModuleEnabled = ${moduleEnabled}\n`)

  // ── 4. Scope the manager role (scopeTarget + scopeFunction + setAllowance) ───
  console.log("[4] Scoping manager role on USDC.transfer with WithinAllowance cap…")
  // Author the function permission with the SDK, then flatten the condition tree
  // into the ConditionFlat[] that scopeFunction expects.
  const { targets } = processPermissions([
    {
      targetAddress: USDC,
      signature: "transfer(address,uint256)",
      // amount (param 1) constrained by the allowance; recipient (param 0) unconstrained
      condition: c.calldataMatches(
        [undefined, c.withinAllowance(ALLOWANCE_KEY)],
        ["address", "uint256"],
      ),
    },
  ])
  const fn = targets[0].functions[0]
  const conditions: ConditionFlat[] = flattenCondition(fn.condition!)

  // (a) scopeTarget(roleKey, USDC)
  await send(
    adminWallet,
    rolesModifier,
    encodeFunctionData({
      abi: rolesAbi,
      functionName: "scopeTarget",
      args: [ROLE_KEY, USDC],
    }),
  )
  // (b) scopeFunction(roleKey, USDC, selector, conditions, ExecutionOptions.None)
  await send(
    adminWallet,
    rolesModifier,
    encodeFunctionData({
      abi: rolesAbi,
      functionName: "scopeFunction",
      args: [
        ROLE_KEY,
        USDC,
        fn.selector,
        conditions.map((cc) => ({
          parent: cc.parent,
          paramType: cc.paramType,
          operator: cc.operator,
          compValue: (cc.compValue ?? "0x") as Hex,
        })),
        ExecutionOptions.None,
      ],
    }),
  )
  // (c) setAllowance(key, balance=cap, maxRefill=cap, refill=0, period=0, timestamp=0)
  await send(
    adminWallet,
    rolesModifier,
    encodeFunctionData({
      abi: rolesAbi,
      functionName: "setAllowance",
      args: [ALLOWANCE_KEY, CAP, CAP, 0n, 0n, 0n],
    }),
  )
  console.log(`    scopeTarget + scopeFunction + setAllowance done (cap=${fmt(CAP)})\n`)

  // ── 5. Assign the manager role to account[1] ────────────────────────────────
  console.log("[5] Assigning manager role to manager account…")
  await send(
    adminWallet,
    rolesModifier,
    encodeFunctionData({
      abi: rolesAbi,
      functionName: "assignRoles",
      args: [ACCOUNTS.manager.address, [ROLE_KEY], [true]],
    }),
  )
  console.log("    assigned\n")

  // ── 6. Fund the Safe with USDC via whale impersonation ──────────────────────
  console.log("[6] Funding the Safe with USDC (impersonate whale)…")
  await publicClient.request({
    // @ts-expect-error anvil method
    method: "anvil_impersonateAccount",
    params: [USDC_WHALE],
  })
  // make sure the whale has gas
  await publicClient.request({
    // @ts-expect-error anvil method
    method: "anvil_setBalance",
    params: [USDC_WHALE, "0xde0b6b3a7640000"], // 1 ETH
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

  // ── Roles exec helper ───────────────────────────────────────────────────────
  // execTransactionWithRole(to, value, data, operation, roleKey, shouldRevert)
  function execWithRole(amount: bigint, dest: Address, roleKey: Hex): Hex {
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [dest, amount],
    })
    return encodeFunctionData({
      abi: rolesAbi,
      functionName: "execTransactionWithRole",
      args: [USDC, 0n, transferData, 0, roleKey, true], // shouldRevert=true → bubble up failures
    })
  }

  const dest = ACCOUNTS.stranger.address // arbitrary recipient

  // ── ASSERTION 1: manager transfers amount <= cap → success, balance drops ────
  console.log("== ASSERTION 1: manager transfer within cap succeeds ==")
  {
    const amount = 40n * ONE_USDC // <= 100 cap
    const before = await usdcBalance(safeAddress)
    let ok = false
    try {
      await send(managerWallet, rolesModifier, execWithRole(amount, dest, ROLE_KEY))
      ok = true
    } catch (e) {
      console.log("    unexpected revert:", (e as Error).message.split("\n")[0])
    }
    const after = await usdcBalance(safeAddress)
    assert(
      "manager exec within cap succeeds and Safe balance decreases by amount",
      ok && before - after === amount,
      `before=${fmt(before)} after=${fmt(after)} delta=${fmt(before - after)}`,
    )
  }

  // ── ASSERTION 2: manager transfers amount > remaining cap → reverts ──────────
  console.log("== ASSERTION 2: manager transfer over cap reverts ==")
  {
    const amount = 80n * ONE_USDC // 40 already spent, 60 remaining → 80 exceeds allowance
    const before = await usdcBalance(safeAddress)
    let reverted = false
    try {
      await send(managerWallet, rolesModifier, execWithRole(amount, dest, ROLE_KEY))
    } catch {
      reverted = true
    }
    const after = await usdcBalance(safeAddress)
    assert(
      "manager exec over remaining allowance reverts and Safe balance unchanged",
      reverted && before === after,
      reverted ? "reverted as expected" : "did NOT revert",
    )
  }

  // ── ASSERTION 3: stranger (no role) → reverts ───────────────────────────────
  console.log("== ASSERTION 3: unauthorized account reverts ==")
  {
    const amount = 10n * ONE_USDC // well within cap, but caller has no role
    const before = await usdcBalance(safeAddress)
    let reverted = false
    try {
      await send(strangerWallet, rolesModifier, execWithRole(amount, dest, ROLE_KEY))
    } catch {
      reverted = true
    }
    const after = await usdcBalance(safeAddress)
    assert(
      "stranger exec with manager roleKey reverts and Safe balance unchanged",
      reverted && before === after,
      reverted ? "reverted as expected" : "did NOT revert",
    )
  }

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error("\nSPIKE ERROR:", e)
  process.exit(1)
})
