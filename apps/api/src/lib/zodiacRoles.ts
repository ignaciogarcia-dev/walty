/**
 * zodiacRoles.ts — PURE calldata builders for Zodiac Roles Modifier setup.
 *
 * No chain I/O, no providers, no signing. Every function returns `{ to, data }` payloads
 * (or bare `data` hex) that a service layer can wrap in Safe transactions or send directly.
 *
 * The modifier address is recovered from transaction logs via `parseDeployedModifier`
 * (receipt-parsing approach, as used by the validated polygon-fork-roles-spike.ts).
 * A deterministic CREATE2 pre-computation is NOT implemented here because the spike
 * proved that parsing the `ModuleProxyCreation` event from the deploy receipt is the
 * simpler, more reliable approach.
 */

import {
  encodeFunctionData,
  encodeAbiParameters,
  parseAbi,
  parseEventLogs,
  keccak256,
  encodePacked,
  getAddress,
  type Hex,
  type Log,
} from "viem"
import {
  processPermissions,
  flattenCondition,
  c,
  encodeKey,
  rolesAbi,
  ExecutionOptions,
  type ConditionFlat,
} from "zodiac-roles-sdk"

// ── Constants ─────────────────────────────────────────────────────────────────

/** Canonical Zodiac ModuleProxyFactory deployed on all major EVM chains. */
export const ZODIAC_MODULE_PROXY_FACTORY: `0x${string}` =
  "0x000000000000aDdB49795b0f9bA5BC298cDda236"

/** Roles v2.1 mastercopy — verified on Polygon mainnet fork. */
export const ROLES_MASTERCOPY: `0x${string}` =
  "0x9646fDAD06d3e24444381f44362a3B0eB343D337"

// ── ABIs ──────────────────────────────────────────────────────────────────────

const factoryAbi = parseAbi([
  "function deployModule(address mastercopy, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ModuleProxyCreation(address indexed proxy, address indexed masterCopy)",
])

const safeModuleAbi = parseAbi(["function enableModule(address module)"])

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
])

// ── Role / allowance keys ────────────────────────────────────────────────────

/**
 * Returns the bytes32 key for the "manager" role.
 * Uses zodiac-roles-sdk `encodeKey` for consistent encoding across the SDK.
 */
export function managerRoleKey(): `0x${string}` {
  return encodeKey("manager") as `0x${string}`
}

/**
 * Returns the bytes32 key for the USDC spending allowance cap.
 * Label "usdc-cap" matches the spike; must remain stable once deployed.
 */
export function managerAllowanceKey(): `0x${string}` {
  return encodeKey("usdc-cap") as `0x${string}`
}

// ── Salt nonce ────────────────────────────────────────────────────────────────

/**
 * Derives a deterministic salt nonce from the Safe address so the same Safe always
 * produces the same Roles modifier proxy address.
 */
export function rolesSaltNonce(safeAddress: string): bigint {
  return BigInt(
    keccak256(encodePacked(["address"], [getAddress(safeAddress)])),
  )
}

// ── Deploy ────────────────────────────────────────────────────────────────────

/**
 * Builds the `deployModule` calldata to deploy a Roles Modifier proxy via the
 * ModuleProxyFactory.  The modifier's owner, avatar, and target are all set to
 * the Safe (owner is overridden to `ownerAddress` via the `setUp` initializer
 * — the spike passes the admin EOA as owner so the admin can directly call scope
 * functions before the Safe owns the modifier).
 */
export function buildDeployModifierTx(args: {
  safeAddress: string
  ownerAddress: string
}): { to: `0x${string}`; data: `0x${string}`; saltNonce: bigint } {
  const safeAddr = getAddress(args.safeAddress)
  const ownerAddr = getAddress(args.ownerAddress)

  // setUp(bytes initParams) — initParams = abi.encode(owner, avatar, target)
  const initParams = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }],
    [ownerAddr, safeAddr, safeAddr],
  )
  const setUpData = encodeFunctionData({
    abi: rolesAbi,
    functionName: "setUp",
    args: [initParams],
  })

  const saltNonce = rolesSaltNonce(safeAddr)

  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: "deployModule",
    args: [ROLES_MASTERCOPY, setUpData, saltNonce],
  })

  return { to: ZODIAC_MODULE_PROXY_FACTORY, data, saltNonce }
}

// ── Modifier address recovery ──────────────────────────────────────────────────

/**
 * Parses the deployed modifier proxy address from a deploy transaction receipt's logs.
 *
 * The spike script uses this receipt-parsing approach (not CREATE2 pre-computation)
 * because the ModuleProxyFactory emits `ModuleProxyCreation(proxy, masterCopy)` and
 * parseEventLogs is simpler and more reliable than re-deriving the salt encoding.
 */
export function parseDeployedModifier(logs: readonly Log[]): `0x${string}` {
  const parsed = parseEventLogs({
    abi: factoryAbi,
    eventName: "ModuleProxyCreation",
    logs: logs as Log[],
  })
  if (parsed.length === 0) throw new Error("No ModuleProxyCreation event found in logs")
  return getAddress((parsed[0].args as { proxy: Hex }).proxy) as `0x${string}`
}

// ── Enable module ─────────────────────────────────────────────────────────────

/**
 * Builds the `enableModule` calldata to be sent as a Safe transaction.
 * The service wraps this as a Safe tx (to: safeAddress, data: returned bytes).
 */
export function buildEnableModuleData(modifierAddress: string): `0x${string}` {
  return encodeFunctionData({
    abi: safeModuleAbi,
    functionName: "enableModule",
    args: [getAddress(modifierAddress)],
  })
}

// ── Scope manager role ────────────────────────────────────────────────────────

/**
 * Builds the 3-call sequence that scopes the "manager" role on the Roles modifier:
 *   [0] scopeTarget(roleKey, token)
 *   [1] scopeFunction(roleKey, token, transfer selector, conditions, ExecutionOptions.None)
 *   [2] setAllowance(allowanceKey, cap, cap, 0, 0, 0)
 *
 * These calls must be sent directly to the modifier (not via the Safe) by the owner
 * EOA, or wrapped as Safe txs by the service layer.
 */
export function buildScopeManagerCalls(args: {
  modifierAddress: string
  tokenAddress: string
  capBaseUnits: bigint
}): { to: `0x${string}`; data: `0x${string}` }[] {
  const modifier = getAddress(args.modifierAddress) as `0x${string}`
  const token = getAddress(args.tokenAddress) as `0x${string}`
  const roleKey = managerRoleKey()
  const allowanceKey = managerAllowanceKey()
  const cap = args.capBaseUnits

  // Build the permission condition tree via the SDK, then flatten for scopeFunction
  const { targets } = processPermissions([
    {
      targetAddress: token,
      signature: "transfer(address,uint256)",
      // recipient (param 0) unconstrained; amount (param 1) capped by allowance
      condition: c.calldataMatches(
        [undefined, c.withinAllowance(allowanceKey)],
        ["address", "uint256"],
      ),
    },
  ])
  const fn = targets[0].functions[0]
  const conditions: ConditionFlat[] = flattenCondition(fn.condition!)

  // (a) scopeTarget
  const scopeTargetData = encodeFunctionData({
    abi: rolesAbi,
    functionName: "scopeTarget",
    args: [roleKey, token],
  })

  // (b) scopeFunction
  const scopeFunctionData = encodeFunctionData({
    abi: rolesAbi,
    functionName: "scopeFunction",
    args: [
      roleKey,
      token,
      fn.selector as Hex,
      conditions.map((cc) => ({
        parent: cc.parent,
        paramType: cc.paramType,
        operator: cc.operator,
        compValue: (cc.compValue ?? "0x") as Hex,
      })),
      ExecutionOptions.None,
    ],
  })

  // (c) setAllowance — fixed cap: balance=maxRefill=cap, no refill, no period
  const setAllowanceData = encodeFunctionData({
    abi: rolesAbi,
    functionName: "setAllowance",
    args: [allowanceKey, cap, cap, 0n, 0n, 0n],
  })

  return [
    { to: modifier, data: scopeTargetData },
    { to: modifier, data: scopeFunctionData },
    { to: modifier, data: setAllowanceData },
  ]
}

// ── Assign role ───────────────────────────────────────────────────────────────

/**
 * Builds the `assignRoles` calldata to grant the "manager" role to an operator.
 * Must be sent to the modifier by the modifier owner.
 */
export function buildAssignManagerTx(args: {
  modifierAddress: string
  managerAddress: string
}): { to: `0x${string}`; data: `0x${string}` } {
  const modifier = getAddress(args.modifierAddress) as `0x${string}`
  const manager = getAddress(args.managerAddress)
  const roleKey = managerRoleKey()

  const data = encodeFunctionData({
    abi: rolesAbi,
    functionName: "assignRoles",
    args: [manager, [roleKey], [true]],
  })

  return { to: modifier, data }
}

// ── Execute refund ────────────────────────────────────────────────────────────

/**
 * Builds the `execTransactionWithRole` calldata that a manager uses to move tokens
 * from the Safe through the Roles modifier.  The inner calldata is an ERC-20
 * `transfer(destination, amount)` call on the token contract.
 *
 * operation=0 (Call), shouldRevert=true so failures bubble up immediately.
 */
export function buildExecRefundTx(args: {
  modifierAddress: string
  tokenAddress: string
  destination: string
  amountBaseUnits: bigint
}): { to: `0x${string}`; data: `0x${string}` } {
  const modifier = getAddress(args.modifierAddress) as `0x${string}`
  const token = getAddress(args.tokenAddress)
  const dest = getAddress(args.destination)
  const roleKey = managerRoleKey()

  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [dest, args.amountBaseUnits],
  })

  const data = encodeFunctionData({
    abi: rolesAbi,
    functionName: "execTransactionWithRole",
    args: [token, 0n, transferData, 0, roleKey, true],
  })

  return { to: modifier, data }
}
