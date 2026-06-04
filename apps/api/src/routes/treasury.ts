import { Router } from "express"
import { getAddress } from "viem"
import { ValidationError } from "@walty/shared/api-utils/errors"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"
import { ensureTreasury, getTreasury } from "../services/treasury.js"
import { ensureRolesModule, assignManager } from "../services/safeRoles.js"

export const treasuryRouter: Router = Router()

treasuryRouter.get(
  "/treasury",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const t = await getTreasury(auth.userId)
    res.json({ treasury: t })
  }),
)

treasuryRouter.post(
  "/treasury/deploy",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "treasury-deploy", 5, 60_000)
    const ownerAddress = req.body?.ownerAddress
    if (typeof ownerAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(ownerAddress)) {
      throw new ValidationError("invalid-owner-address")
    }
    let owner: string
    try {
      owner = getAddress(ownerAddress)
    } catch {
      throw new ValidationError("invalid-owner-address")
    }
    const t = await ensureTreasury(auth.userId, owner)
    res.json({ treasury: t })
  }),
)

treasuryRouter.post(
  "/treasury/roles/setup",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "treasury-roles-setup", 3, 60_000)
    const t = await ensureRolesModule(auth.userId)
    res.json({ treasury: t })
  }),
)

treasuryRouter.post(
  "/treasury/roles/managers",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByUser(auth.userId, "treasury-roles-assign", 10, 60_000)
    const managerAddress = req.body?.managerAddress
    if (typeof managerAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(managerAddress)) {
      throw new ValidationError("invalid-manager-address")
    }
    let normalizedManagerAddress: string
    try {
      normalizedManagerAddress = getAddress(managerAddress)
    } catch {
      throw new ValidationError("invalid-manager-address")
    }
    await assignManager(auth.userId, normalizedManagerAddress)
    res.json({ ok: true })
  }),
)
