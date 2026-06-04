/**
 * safeRoles.ts — Zodiac Roles Modifier orchestration service.
 *
 * Deploys and configures a Roles Modifier for a business treasury's Safe so that
 * operator (cashier) EOAs can move capped USDC amounts without the Safe owner
 * signing each transaction.
 *
 * All on-chain transactions are signed by the admin EOA (SAFE_DEPLOYER_PRIVATE_KEY),
 * which is the Safe's sole owner in stratum (a).
 *
 * Lifecycle (guarded by rolesStatus):
 *   none     → deploy modifier proxy + enable it on the Safe  → "enabled"
 *   enabled  → scopeTarget + scopeFunction + setAllowance      → "scoped"
 *   scoped   → return early (idempotent)
 *
 * `assignManager` sends an `assignRoles` tx to the modifier; it requires the
 * treasury to already be "scoped".
 */

import Safe from "@safe-global/protocol-kit"
import { and, eq } from "drizzle-orm"
import { getAddress } from "viem"
import { db, businessTreasuries } from "@walty/db"
import { getRelayToken } from "@walty/shared/tokens/tokenRegistry"
import { env } from "../config/env.js"
import { getAdminAddress, getAdminWalletClient, getAdminPublicClient } from "../lib/adminSigner.js"
import { getPublicRpcUrl } from "@walty/shared/providers/rpc/public"
import {
  buildDeployModifierTx,
  parseDeployedModifier,
  buildEnableModuleData,
  buildScopeManagerCalls,
  buildAssignManagerTx,
} from "../lib/zodiacRoles.js"
import { getTreasury } from "./treasury.js"

export type { BusinessTreasury } from "./treasury.js"
import type { BusinessTreasury } from "./treasury.js"

// Default cap: 1 000 USDC (6 decimals)
const DEFAULT_MANAGER_CAP = 1_000n * 10n ** 6n

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the USDC token address for a given chainId using the shared token
 * registry's `getRelayToken` getter (which returns the USDC token for the chain).
 * Falls back to the Polygon mainnet native USDC if the registry has no entry.
 */
function getUsdcAddress(chainId: number): `0x${string}` {
  const token = getRelayToken(chainId)
  if (!token?.address) {
    // Fallback: Polygon mainnet native USDC (canonical, matches spike constants)
    return "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
  }
  return token.address
}

/**
 * Persists a partial update to a business_treasuries row for (userId, chainId).
 * Returns the updated row.
 */
async function updateTreasury(
  userId: number,
  chainId: number,
  patch: Partial<Pick<BusinessTreasury, "rolesModifierAddress" | "rolesStatus" | "managerCap">>,
): Promise<BusinessTreasury> {
  const [updated] = await db
    .update(businessTreasuries)
    .set(patch)
    .where(
      and(
        eq(businessTreasuries.userId, userId),
        eq(businessTreasuries.chainId, chainId),
      ),
    )
    .returning()
  if (!updated) throw new Error(`Treasury row not found for userId=${userId} chainId=${chainId}`)
  return updated
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Idempotently sets up the Zodiac Roles Modifier for a business treasury.
 *
 * Call order mirrors the validated polygon-fork-roles-spike.ts:
 *   1. deployModule (factory tx)  → parseDeployedModifier from logs
 *   2. enableModule on the Safe   (via Safe protocol-kit, admin EOA signs)
 *   3. scopeTarget + scopeFunction + setAllowance (3 direct modifier txs)
 *
 * A failed intermediate step leaves rolesStatus at "none" or "enabled" so a
 * retry call continues from where it left off.
 */
export async function ensureRolesModule(
  userId: number,
  opts?: { managerCapBaseUnits?: bigint },
): Promise<BusinessTreasury> {
  let t = await getTreasury(userId)
  if (!t) throw new Error(`Treasury not found for userId=${userId}`)
  if (t.status !== "deployed") {
    throw new Error(
      `Treasury must be deployed before setting up Roles (current status: ${t.status})`,
    )
  }
  // Already fully configured — nothing to do.
  if (t.rolesStatus === "scoped") return t

  const chainId = t.chainId
  const safeAddress = t.safeAddress
  const walletClient = getAdminWalletClient(chainId)
  const publicClient = getAdminPublicClient(chainId)
  const adminAddress = getAdminAddress()

  // ── Phase 1: deploy modifier + enable on Safe ─────────────────────────────
  if (!t.rolesModifierAddress) {
    // 1a. Deploy the Roles Modifier proxy via the ModuleProxyFactory
    const { to, data } = buildDeployModifierTx({ safeAddress, ownerAddress: adminAddress })
    const deployHash = await walletClient.sendTransaction({ to, data })
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
    if (deployReceipt.status !== "success") {
      throw new Error(`deployModule tx reverted: ${deployHash}`)
    }
    const modifierAddress = parseDeployedModifier(deployReceipt.logs)

    // 1b. Enable the modifier on the Safe via Safe protocol-kit
    //     (admin EOA is the sole owner, threshold 1 — single signature suffices)
    const protocolKit = await Safe.init({
      provider: env.safeRpcUrl || getPublicRpcUrl(chainId),
      signer: env.safeDeployerPrivateKey,
      safeAddress,
    })
    const enableData = buildEnableModuleData(modifierAddress)
    const enableSafeTx = await protocolKit.createTransaction({
      transactions: [{ to: safeAddress, value: "0", data: enableData }],
    })
    const signedEnable = await protocolKit.signTransaction(enableSafeTx)
    const execEnable = await protocolKit.executeTransaction(signedEnable)
    await publicClient.waitForTransactionReceipt({ hash: execEnable.hash as `0x${string}` })

    // Persist before proceeding to scope; allows resumption if scope fails
    t = await updateTreasury(userId, chainId, {
      rolesModifierAddress: modifierAddress,
      rolesStatus: "enabled",
    })
  }

  // ── Phase 2: scope the manager role ──────────────────────────────────────
  if (t.rolesStatus !== "scoped") {
    const modifierAddress = t.rolesModifierAddress!
    const cap = opts?.managerCapBaseUnits ?? DEFAULT_MANAGER_CAP
    const usdcAddress = getUsdcAddress(chainId)

    const scopeCalls = buildScopeManagerCalls({
      modifierAddress,
      tokenAddress: usdcAddress,
      capBaseUnits: cap,
    })

    for (const { to, data } of scopeCalls) {
      const hash = await walletClient.sendTransaction({ to, data })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== "success") {
        throw new Error(`Scope tx reverted: ${hash}`)
      }
    }

    t = await updateTreasury(userId, chainId, {
      managerCap: cap.toString(),
      rolesStatus: "scoped",
    })
  }

  return t
}

/**
 * Grants the "manager" Zodiac Role to an operator EOA address.
 * The treasury must already be fully scoped (rolesStatus === "scoped").
 */
export async function assignManager(userId: number, managerAddress: string): Promise<void> {
  const t = await getTreasury(userId)
  if (!t) throw new Error(`Treasury not found for userId=${userId}`)
  if (!t.rolesModifierAddress) {
    throw new Error(`Roles modifier not deployed for userId=${userId}`)
  }
  if (t.rolesStatus !== "scoped") {
    throw new Error(
      `Treasury roles must be scoped before assigning a manager (current: ${t.rolesStatus})`,
    )
  }

  // Validate and normalise the manager address
  const normalised = getAddress(managerAddress)

  const chainId = t.chainId
  const walletClient = getAdminWalletClient(chainId)
  const publicClient = getAdminPublicClient(chainId)

  const { to, data } = buildAssignManagerTx({
    modifierAddress: t.rolesModifierAddress,
    managerAddress: normalised,
  })

  const hash = await walletClient.sendTransaction({ to, data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") {
    throw new Error(`assignRoles tx reverted: ${hash}`)
  }
}
