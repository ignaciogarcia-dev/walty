import { describe, it, expect } from "vitest"
import {
  decodeFunctionData,
  toFunctionSelector,
  parseAbi,
  type Hex,
} from "viem"
import { rolesAbi } from "zodiac-roles-sdk"
import {
  ZODIAC_MODULE_PROXY_FACTORY,
  ROLES_MASTERCOPY,
  managerRoleKey,
  managerAllowanceKey,
  rolesSaltNonce,
  buildDeployModifierTx,
  parseDeployedModifier,
  buildEnableModuleData,
  buildScopeManagerCalls,
  buildAssignManagerTx,
  buildExecRefundTx,
} from "../src/lib/zodiacRoles.js"

const FAKE_SAFE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const FAKE_OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
const FAKE_MODIFIER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
const FAKE_TOKEN = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
const FAKE_MANAGER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
const FAKE_DEST = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"

const factoryAbi = parseAbi([
  "function deployModule(address mastercopy, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ModuleProxyCreation(address indexed proxy, address indexed masterCopy)",
])

// Compute expected 4-byte selectors from the rolesAbi
function rolesSelector(name: string): Hex {
  const entry = rolesAbi.find((x) => x.type === "function" && x.name === name)
  if (!entry) throw new Error(`rolesAbi has no function "${name}"`)
  return toFunctionSelector(entry as never)
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("ZODIAC_MODULE_PROXY_FACTORY is the canonical address (checksummed)", () => {
    expect(ZODIAC_MODULE_PROXY_FACTORY).toBe(
      "0x000000000000aDdB49795b0f9bA5BC298cDda236",
    )
  })

  it("ROLES_MASTERCOPY is the Roles v2 mastercopy (checksummed)", () => {
    expect(ROLES_MASTERCOPY).toBe(
      "0x9646fDAD06d3e24444381f44362a3B0eB343D337",
    )
  })
})

// ── Key helpers ───────────────────────────────────────────────────────────────

describe("managerRoleKey", () => {
  it("returns a 32-byte hex string (66 chars)", () => {
    const key = managerRoleKey()
    expect(key).toMatch(/^0x[0-9a-f]{64}$/i)
  })

  it("is deterministic", () => {
    expect(managerRoleKey()).toBe(managerRoleKey())
  })
})

describe("managerAllowanceKey", () => {
  it("returns a 32-byte hex string (66 chars)", () => {
    const key = managerAllowanceKey()
    expect(key).toMatch(/^0x[0-9a-f]{64}$/i)
  })

  it("is different from managerRoleKey", () => {
    expect(managerAllowanceKey()).not.toBe(managerRoleKey())
  })
})

// ── Salt nonce ────────────────────────────────────────────────────────────────

describe("rolesSaltNonce", () => {
  it("returns a bigint", () => {
    expect(typeof rolesSaltNonce(FAKE_SAFE)).toBe("bigint")
  })

  it("is deterministic for the same safeAddress", () => {
    expect(rolesSaltNonce(FAKE_SAFE)).toBe(rolesSaltNonce(FAKE_SAFE))
  })

  it("differs for different safeAddresses", () => {
    expect(rolesSaltNonce(FAKE_SAFE)).not.toBe(rolesSaltNonce(FAKE_OWNER))
  })
})

// ── buildDeployModifierTx ────────────────────────────────────────────────────

describe("buildDeployModifierTx", () => {
  const tx = buildDeployModifierTx({
    safeAddress: FAKE_SAFE,
    ownerAddress: FAKE_OWNER,
  })

  it("sends to the canonical ModuleProxyFactory", () => {
    expect(tx.to).toBe(ZODIAC_MODULE_PROXY_FACTORY)
  })

  it("data starts with the deployModule selector (0xf1ab873c)", () => {
    expect(tx.data.slice(0, 10).toLowerCase()).toBe("0xf1ab873c")
  })

  it("embeds the Roles mastercopy address", () => {
    // The mastercopy address without 0x, lowercased, must appear in the calldata
    expect(tx.data.toLowerCase()).toContain(
      ROLES_MASTERCOPY.slice(2).toLowerCase(),
    )
  })

  it("saltNonce matches rolesSaltNonce(safeAddress)", () => {
    expect(tx.saltNonce).toBe(rolesSaltNonce(FAKE_SAFE))
  })

  it("decodes cleanly with factoryAbi", () => {
    const decoded = decodeFunctionData({ abi: factoryAbi, data: tx.data })
    expect(decoded.functionName).toBe("deployModule")
    const [mastercopy, , nonce] = decoded.args as [Hex, Hex, bigint]
    expect(mastercopy.toLowerCase()).toBe(ROLES_MASTERCOPY.toLowerCase())
    expect(nonce).toBe(tx.saltNonce)
  })
})

// ── parseDeployedModifier ─────────────────────────────────────────────────────

describe("parseDeployedModifier", () => {
  it("extracts the proxy address from a ModuleProxyCreation log array", () => {
    // Build a minimal synthetic log matching the event ABI
    const { encodeEventTopics, encodeAbiParameters } = require("viem") as typeof import("viem")

    // Use a known-valid EIP-55 checksummed address
    const proxy = FAKE_DEST as Hex
    const masterCopy = ROLES_MASTERCOPY as Hex

    const topics = encodeEventTopics({
      abi: factoryAbi,
      eventName: "ModuleProxyCreation",
      args: { proxy, masterCopy },
    }) as Hex[]

    const syntheticLog = {
      address: ZODIAC_MODULE_PROXY_FACTORY as Hex,
      topics,
      data: "0x" as Hex,
      // other fields are not used by parseDeployedModifier
      blockHash: "0x" as Hex,
      blockNumber: 1n,
      logIndex: 0,
      transactionHash: "0x" as Hex,
      transactionIndex: 0,
      removed: false,
    }

    const result = parseDeployedModifier([syntheticLog as never])
    expect(result.toLowerCase()).toBe(proxy.toLowerCase())
  })
})

// ── buildEnableModuleData ────────────────────────────────────────────────────

describe("buildEnableModuleData", () => {
  it("returns hex starting with the enableModule selector", () => {
    const safeAbi = parseAbi(["function enableModule(address module)"])
    const expectedSel = toFunctionSelector(safeAbi[0])
    const data = buildEnableModuleData(FAKE_MODIFIER)
    expect(data.slice(0, 10).toLowerCase()).toBe(expectedSel.toLowerCase())
  })

  it("encodes the modifier address in the calldata", () => {
    const data = buildEnableModuleData(FAKE_MODIFIER)
    expect(data.toLowerCase()).toContain(FAKE_MODIFIER.slice(2).toLowerCase())
  })
})

// ── buildScopeManagerCalls ───────────────────────────────────────────────────

describe("buildScopeManagerCalls", () => {
  const CAP = 100_000_000n // 100 USDC (6 dec)
  const calls = buildScopeManagerCalls({
    modifierAddress: FAKE_MODIFIER,
    tokenAddress: FAKE_TOKEN,
    capBaseUnits: CAP,
  })

  it("returns exactly 3 calls", () => {
    expect(calls).toHaveLength(3)
  })

  it("all calls are addressed to the modifier", () => {
    for (const call of calls) {
      expect(call.to.toLowerCase()).toBe(FAKE_MODIFIER.toLowerCase())
    }
  })

  it("first call is scopeTarget (selector 0x0c6c76b8)", () => {
    expect(calls[0].data.slice(0, 10).toLowerCase()).toBe(
      rolesSelector("scopeTarget").toLowerCase(),
    )
  })

  it("second call is scopeFunction (selector 0x7508dd98)", () => {
    expect(calls[1].data.slice(0, 10).toLowerCase()).toBe(
      rolesSelector("scopeFunction").toLowerCase(),
    )
  })

  it("third call is setAllowance (selector 0xa8ec43ee)", () => {
    expect(calls[2].data.slice(0, 10).toLowerCase()).toBe(
      rolesSelector("setAllowance").toLowerCase(),
    )
  })

  it("scopeTarget encodes the manager roleKey and token address", () => {
    const decoded = decodeFunctionData({
      abi: rolesAbi as never,
      data: calls[0].data,
    })
    expect(decoded.functionName).toBe("scopeTarget")
    const [rk, token] = decoded.args as [Hex, Hex]
    expect(rk.toLowerCase()).toBe(managerRoleKey().toLowerCase())
    expect(token.toLowerCase()).toBe(FAKE_TOKEN.toLowerCase())
  })

  it("setAllowance encodes cap as balance and maxRefill with 0 for refill/period/timestamp", () => {
    const decoded = decodeFunctionData({
      abi: rolesAbi as never,
      data: calls[2].data,
    })
    expect(decoded.functionName).toBe("setAllowance")
    const [key, balance, maxRefill, refill, period, timestamp] =
      decoded.args as [Hex, bigint, bigint, bigint, bigint, bigint]
    expect(key.toLowerCase()).toBe(managerAllowanceKey().toLowerCase())
    expect(balance).toBe(CAP)
    expect(maxRefill).toBe(CAP)
    expect(refill).toBe(0n)
    expect(period).toBe(0n)
    expect(timestamp).toBe(0n)
  })
})

// ── buildAssignManagerTx ─────────────────────────────────────────────────────

describe("buildAssignManagerTx", () => {
  const tx = buildAssignManagerTx({
    modifierAddress: FAKE_MODIFIER,
    managerAddress: FAKE_MANAGER,
  })

  it("sends to the modifier", () => {
    expect(tx.to.toLowerCase()).toBe(FAKE_MODIFIER.toLowerCase())
  })

  it("data starts with the assignRoles selector", () => {
    expect(tx.data.slice(0, 10).toLowerCase()).toBe(
      rolesSelector("assignRoles").toLowerCase(),
    )
  })

  it("decodes to (manager, [roleKey], [true])", () => {
    const decoded = decodeFunctionData({
      abi: rolesAbi as never,
      data: tx.data,
    })
    expect(decoded.functionName).toBe("assignRoles")
    const [addr, keys, flags] = decoded.args as [Hex, Hex[], boolean[]]
    expect(addr.toLowerCase()).toBe(FAKE_MANAGER.toLowerCase())
    expect(keys).toHaveLength(1)
    expect(keys[0].toLowerCase()).toBe(managerRoleKey().toLowerCase())
    expect(flags).toEqual([true])
  })
})

// ── buildExecRefundTx ─────────────────────────────────────────────────────────

describe("buildExecRefundTx", () => {
  const AMOUNT = 25_000_000n // 25 USDC

  const tx = buildExecRefundTx({
    modifierAddress: FAKE_MODIFIER,
    tokenAddress: FAKE_TOKEN,
    destination: FAKE_DEST,
    amountBaseUnits: AMOUNT,
  })

  it("sends to the modifier", () => {
    expect(tx.to.toLowerCase()).toBe(FAKE_MODIFIER.toLowerCase())
  })

  it("data starts with the execTransactionWithRole selector", () => {
    expect(tx.data.slice(0, 10).toLowerCase()).toBe(
      rolesSelector("execTransactionWithRole").toLowerCase(),
    )
  })

  it("decodes outer call with correct token, value=0, roleKey, shouldRevert=true", () => {
    const decoded = decodeFunctionData({
      abi: rolesAbi as never,
      data: tx.data,
    })
    expect(decoded.functionName).toBe("execTransactionWithRole")
    const [toAddr, value, , , roleKey, shouldRevert] = decoded.args as [
      Hex,
      bigint,
      Hex,
      number,
      Hex,
      boolean,
    ]
    expect(toAddr.toLowerCase()).toBe(FAKE_TOKEN.toLowerCase())
    expect(value).toBe(0n)
    expect(roleKey.toLowerCase()).toBe(managerRoleKey().toLowerCase())
    expect(shouldRevert).toBe(true)
  })

  it("inner calldata is erc20.transfer(destination, amount)", () => {
    const erc20Abi = parseAbi([
      "function transfer(address to, uint256 amount) returns (bool)",
    ])
    const decoded = decodeFunctionData({
      abi: rolesAbi as never,
      data: tx.data,
    })
    const [, , innerData] = decoded.args as [Hex, bigint, Hex]
    const innerDecoded = decodeFunctionData({ abi: erc20Abi, data: innerData })
    expect(innerDecoded.functionName).toBe("transfer")
    const [dest, amount] = innerDecoded.args as [Hex, bigint]
    expect(dest.toLowerCase()).toBe(FAKE_DEST.toLowerCase())
    expect(amount).toBe(AMOUNT)
  })
})
