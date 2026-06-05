import { and, eq, isNotNull, sql } from "drizzle-orm"
import { Router } from "express"
import { DatabaseError } from "pg"
import { formatUnits, isAddress } from "viem"
import {
  db,
  addresses,
  businessMembers,
  businessSettings,
  users,
} from "@walty/db"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import {
  AUDIT_ACTIONS,
  writeAuditLog,
} from "@walty/shared/business/auditLog"
import {
  getOperatorTokenBalances,
  operatorHasBalance,
} from "@walty/shared/business/operatorBalance"
import { getActiveMpcKey, isMpcBusiness } from "@walty/shared/business/mpcStatus"
import { Permission } from "@walty/shared/permissions"
import {
  canDeleteInvitation,
  canReactivateMember,
} from "@walty/shared/policies/business.policy"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import { logSecurityEvent } from "@walty/shared/security/logSecurityEvent"
import { authed, businessed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"
import { withBusinessAuth } from "../middleware/withBusiness.js"

export const businessRouter: Router = Router()

const VALID_ROLES = ["cashier"] as const
type MemberRole = (typeof VALID_ROLES)[number]

function pgDatabaseError(err: unknown): DatabaseError | null {
  if (err instanceof DatabaseError) return err
  if (typeof err === "object" && err !== null && "cause" in err) {
    const c = (err as { cause: unknown }).cause
    if (c instanceof DatabaseError) return c
  }
  return null
}

// ---------- /business/context ----------
businessRouter.get(
  "/business/context",
  ...withBusinessAuth(Permission.BUSINESS_CONTEXT_READ),
  businessed(async (req, res) => {
    const { business } = req
    let merchantWalletAddress: string | null = null

    if (business.isOwner) {
      const [linkedAddress] = await db
        .select({ address: addresses.address })
        .from(addresses)
        .where(eq(addresses.userId, business.businessId))
        .limit(1)
      merchantWalletAddress = linkedAddress?.address ?? null
    } else {
      merchantWalletAddress = business.walletAddress ?? null
    }

    const businessSetting = await db.query.businessSettings.findFirst({
      where: eq(businessSettings.userId, business.businessId),
      columns: { name: true },
    })
    const businessUser = await db.query.users.findFirst({
      where: eq(users.id, business.businessId),
      columns: { email: true },
    })

    const businessName =
      businessSetting?.name ?? businessUser?.email ?? "Business"

    // businessId is the owner's userId (for a cashier too), so this reflects the
    // owner's custody — drives the keyless-cashier UI branches on the client.
    const isMpc = await isMpcBusiness(business.businessId)

    res.json({
      isOwner: business.isOwner,
      role: business.role,
      businessId: business.businessId,
      merchantWalletAddress,
      businessName,
      isMpc,
    })
  }),
)

// ---------- /business/settings ----------
businessRouter.get(
  "/business/settings",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const [settings] = await db
      .select()
      .from(businessSettings)
      .where(eq(businessSettings.userId, auth.userId))
      .limit(1)
    res.json({ settings: settings ?? null })
  }),
)

businessRouter.post(
  "/business/settings",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "business-settings", 10, 60_000)

    const body = req.body ?? {}
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    if (name.length < 2 || name.length > 80) {
      throw new ValidationError("business name must be 2-80 characters")
    }

    const [membership] = await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(eq(businessMembers.userId, auth.userId))
      .limit(1)

    if (membership) {
      throw new ConflictError("operators cannot own a business")
    }

    await db
      .insert(businessSettings)
      .values({ userId: auth.userId, name })
      .onConflictDoUpdate({
        target: businessSettings.userId,
        set: { name, updatedAt: new Date() },
      })

    res.json({ ok: true, name })
  }),
)

// ---------- /business/members ----------
businessRouter.get(
  "/business/members",
  ...withBusinessAuth(Permission.MEMBER_LIST),
  businessed(async (req, res) => {
    const { business } = req
    const rows = await db
      .select({
        id: businessMembers.id,
        role: businessMembers.role,
        status: businessMembers.status,
        inviteEmail: businessMembers.inviteEmail,
        inviteToken: businessMembers.inviteToken,
        userId: businessMembers.userId,
        expiresAt: businessMembers.expiresAt,
        createdAt: businessMembers.createdAt,
        lastActivityAt: businessMembers.lastActivityAt,
        walletAddress: businessMembers.walletAddress,
        userEmail: users.email,
      })
      .from(businessMembers)
      .leftJoin(users, eq(businessMembers.userId, users.id))
      .where(eq(businessMembers.businessId, business.businessId))
      .orderBy(businessMembers.createdAt)

    const members = rows.map((row) => ({
      id: row.id,
      role: row.role,
      status: row.status,
      inviteEmail: row.inviteEmail,
      inviteToken: row.inviteToken,
      userId: row.userId,
      email: row.userEmail ?? null,
      walletAddress: row.walletAddress ?? null,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
    }))

    res.json({ members })
  }),
)

// ---------- /business/members/next-index ----------
businessRouter.get(
  "/business/members/next-index",
  ...withBusinessAuth(Permission.MEMBER_INVITE),
  businessed(async (req, res) => {
    const { business } = req
    const [result] = await db
      .select({
        maxIndex: sql<number>`COALESCE(MAX(${businessMembers.derivationIndex}), 0)`,
      })
      .from(businessMembers)
      .where(eq(businessMembers.businessId, business.businessId))

    const nextIndex = (result?.maxIndex ?? 0) + 1
    res.json({ nextIndex })
  }),
)

// ---------- /business/members/invite ----------
businessRouter.post(
  "/business/members/invite",
  ...withBusinessAuth(Permission.MEMBER_INVITE),
  businessed(async (req, res) => {
    const { auth, business } = req
    const ip = req.clientIp

    const { role, inviteEmail, expiresInDays, walletAddress, derivationIndex } =
      req.body ?? {}

    if (!VALID_ROLES.includes(role as MemberRole)) {
      throw new ValidationError("role must be cashier")
    }

    // MPC business: cashiers are keyless. The owner can't HD-derive a per-operator
    // address (no seed), so the member receives to the business MPC address and
    // carries no derivationIndex. Legacy mnemonic businesses keep the HD path.
    const mpcKey = await getActiveMpcKey(business.businessId)
    let memberWalletAddress: string
    let memberDerivationIndex: number | null

    if (mpcKey) {
      memberWalletAddress = mpcKey.address
      memberDerivationIndex = null
    } else {
      if (!walletAddress || !isAddress(walletAddress)) {
        throw new ValidationError("valid walletAddress is required")
      }
      if (
        !derivationIndex ||
        typeof derivationIndex !== "number" ||
        derivationIndex < 1
      ) {
        throw new ValidationError(
          "valid derivationIndex is required (must be >= 1)",
        )
      }

      const indexTaken = await db.query.businessMembers.findFirst({
        where: and(
          eq(businessMembers.businessId, business.businessId),
          eq(businessMembers.derivationIndex, derivationIndex),
        ),
        columns: { id: true },
      })
      if (indexTaken) {
        throw new ValidationError("derivation index already in use for this business")
      }

      memberWalletAddress = walletAddress
      memberDerivationIndex = derivationIndex
    }

    const days = Math.min(Math.max(Number(expiresInDays) || 7, 1), 30)
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    let member: typeof businessMembers.$inferSelect
    try {
      ;[member] = await db
        .insert(businessMembers)
        .values({
          businessId: business.businessId,
          role: role as MemberRole,
          status: "invited",
          inviteEmail: inviteEmail ?? null,
          invitedBy: auth.userId,
          expiresAt,
          derivationIndex: memberDerivationIndex,
          walletAddress: memberWalletAddress,
        })
        .returning()
    } catch (err) {
      const pg = pgDatabaseError(err)
      if (
        pg?.code === "23505" &&
        pg.constraint != null &&
        String(pg.constraint).includes("derivation_index")
      ) {
        throw new ValidationError("derivation-index-conflict")
      }
      throw err
    }

    writeAuditLog(
      business.businessId,
      auth.userId,
      AUDIT_ACTIONS.MEMBER_INVITED,
      {
        memberId: member.id,
        role,
        inviteEmail: inviteEmail ?? null,
        derivationIndex: member.derivationIndex,
        walletAddress: member.walletAddress,
      },
      ip,
    )

    res.json({
      id: member.id,
      inviteToken: member.inviteToken,
      inviteUrl: `/join/${member.inviteToken}`,
      role: member.role,
      derivationIndex: member.derivationIndex,
      walletAddress: member.walletAddress,
      expiresAt: member.expiresAt.toISOString(),
    })
  }),
)

// ---------- /business/members/:id ----------
businessRouter.patch(
  "/business/members/:id",
  ...withBusinessAuth(Permission.MEMBER_MANAGE),
  businessed(async (req, res) => {
    const { auth, business, actor } = req
    const ip = req.clientIp

    const memberId = Number(req.params.id)
    if (isNaN(memberId)) throw new ValidationError("invalid member id")

    const [member] = await db
      .select()
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.id, memberId),
          eq(businessMembers.businessId, business.businessId),
        ),
      )
      .limit(1)

    if (!member) throw new NotFoundError("member not found")

    const { action, role } = req.body ?? {}

    if (action === "change_role") {
      if (!VALID_ROLES.includes(role as MemberRole)) {
        throw new ValidationError("role must be cashier")
      }
      const oldRole = member.role
      await db
        .update(businessMembers)
        .set({ role: role as MemberRole })
        .where(eq(businessMembers.id, memberId))

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
        { memberId, oldRole, newRole: role },
        ip,
      )
      res.json({ ok: true })
      return
    }

    if (action === "suspend") {
      await db
        .update(businessMembers)
        .set({ status: "suspended" })
        .where(eq(businessMembers.id, memberId))
      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.MEMBER_SUSPENDED,
        { memberId },
        ip,
      )
      res.json({ ok: true })
      return
    }

    if (action === "revoke") {
      // For an MPC business the member's walletAddress IS the business treasury
      // address (always funded), so the per-operator balance guard doesn't apply —
      // there's no sweepable operator wallet and no lingering key. Revoke is a
      // pure status flip. Mnemonic businesses keep the guard.
      const mpcKey = await getActiveMpcKey(business.businessId)
      if (!mpcKey && member.walletAddress) {
        const hasBal = await operatorHasBalance(member.walletAddress)
        if (hasBal) {
          logSecurityEvent({
            actor,
            action: "revoke_member",
            result: "denied_policy",
            reason: "operator_has_balance",
            ip,
            path: req.path,
          })
          throw new ValidationError("operator-has-balance")
        }
      }
      await db
        .update(businessMembers)
        .set({ status: "revoked" })
        .where(eq(businessMembers.id, memberId))
      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.MEMBER_REVOKED,
        { memberId },
        ip,
      )
      res.json({ ok: true })
      return
    }

    if (action === "reactivate") {
      const policy = canReactivateMember({ status: member.status })
      if (!policy.allowed) {
        logSecurityEvent({
          actor,
          action: "reactivate_member",
          result: "denied_policy",
          reason: policy.reason,
          ip,
          path: req.path,
        })
        throw new ValidationError(policy.reason)
      }
      await db
        .update(businessMembers)
        .set({ status: "active" })
        .where(eq(businessMembers.id, memberId))
      res.json({ ok: true })
      return
    }

    throw new ValidationError("invalid action")
  }),
)

businessRouter.delete(
  "/business/members/:id",
  ...withBusinessAuth(Permission.MEMBER_MANAGE),
  businessed(async (req, res) => {
    const { business, actor } = req
    const ip = req.clientIp

    const memberId = Number(req.params.id)
    if (isNaN(memberId)) throw new ValidationError("invalid member id")

    const [member] = await db
      .select()
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.id, memberId),
          eq(businessMembers.businessId, business.businessId),
        ),
      )
      .limit(1)

    if (!member) throw new NotFoundError("member not found")

    const policy = canDeleteInvitation({ status: member.status })
    if (!policy.allowed) {
      logSecurityEvent({
        actor,
        action: "delete_member",
        result: "denied_policy",
        reason: policy.reason,
        ip,
      })
      throw new ValidationError(policy.reason)
    }

    await db.delete(businessMembers).where(eq(businessMembers.id, memberId))
    res.json({ ok: true })
  }),
)

// ---------- /business/operator-wallets ----------
businessRouter.get(
  "/business/operator-wallets",
  ...withBusinessAuth(Permission.MEMBER_LIST),
  businessed(async (req, res) => {
    const { business } = req
    const rows = await db
      .select({
        id: businessMembers.id,
        status: businessMembers.status,
        walletAddress: businessMembers.walletAddress,
        derivationIndex: businessMembers.derivationIndex,
        userId: businessMembers.userId,
        inviteEmail: businessMembers.inviteEmail,
        userEmail: users.email,
      })
      .from(businessMembers)
      .leftJoin(users, eq(businessMembers.userId, users.id))
      .where(
        and(
          eq(businessMembers.businessId, business.businessId),
          isNotNull(businessMembers.walletAddress),
        ),
      )
      .orderBy(businessMembers.derivationIndex)

    const wallets = await Promise.all(
      rows.map(async (row) => {
        const displayName =
          row.userEmail ?? row.inviteEmail ?? `Cajero #${row.derivationIndex}`

        let balances = { USDC: "0.00", USDT: "0.00" }
        try {
          const raw = await getOperatorTokenBalances(row.walletAddress!)
          const USDC_DECIMALS = 6
          const USDT_DECIMALS = 6
          balances = {
            USDC: formatUnits(raw.USDC ?? 0n, USDC_DECIMALS),
            USDT: formatUnits(raw.USDT ?? 0n, USDT_DECIMALS),
          }
        } catch {
          // RPC failure for one wallet → show 0, don't block the list
        }

        return {
          memberId: row.id,
          displayName,
          walletAddress: row.walletAddress!,
          derivationIndex: row.derivationIndex!,
          status: row.status,
          balances,
        }
      }),
    )

    res.json({ wallets })
  }),
)
