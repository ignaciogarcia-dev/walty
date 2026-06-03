import { Router } from "express"
import { ValidationError } from "@walty/shared/api-utils/errors"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"
import { ensureTreasury, getTreasury } from "../services/treasury.js"

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
    const ownerAddress = req.body?.ownerAddress
    if (typeof ownerAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(ownerAddress)) {
      throw new ValidationError("invalid-owner-address")
    }
    const t = await ensureTreasury(auth.userId, ownerAddress)
    res.json({ treasury: t })
  }),
)
