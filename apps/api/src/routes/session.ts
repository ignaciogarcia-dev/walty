import { eq } from "drizzle-orm"
import { Router } from "express"
import {
  db,
  users,
  businessMembers,
  businessSettings,
  mpcKeys,
} from "@walty/db"
import { NotFoundError } from "@walty/shared/api-utils/errors"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"

export const sessionRouter: Router = Router()

export type BusinessStatus = "active" | "suspended" | "revoked" | null

sessionRouter.get(
  "/session",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const [user, settings, memberships, activeMpcKey] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, auth.userId),
        columns: { id: true, email: true },
      }),
      db.query.businessSettings.findFirst({
        where: eq(businessSettings.userId, auth.userId),
        columns: { name: true },
      }),
      db.query.businessMembers.findMany({
        where: eq(businessMembers.userId, auth.userId),
        columns: { status: true },
      }),
      db.query.mpcKeys.findFirst({
        where: eq(mpcKeys.userId, auth.userId),
        columns: { id: true, status: true },
      }),
    ])

    if (!user) throw new NotFoundError("user not found")

    const active = memberships.find((m) => m.status === "active")
    const suspended = memberships.find((m) => m.status === "suspended")
    const revoked = memberships.find((m) => m.status === "revoked")
    const isOwner = !active && !suspended && !revoked
    const hasActiveBusiness = isOwner ? !!settings : !!active
    const businessStatus: BusinessStatus = isOwner
      ? settings
        ? "active"
        : null
      : active
        ? "active"
        : suspended
          ? "suspended"
          : revoked
            ? "revoked"
            : null

    res.json({
      user: {
        id: user.id,
        email: user.email,
        hasWallet: activeMpcKey?.status === "active",
        hasActiveBusiness,
        hasBusinessSettings: !!settings,
        isOwner,
        businessStatus,
        sid: auth.sid ?? null,
      },
      business: {
        name: settings?.name ?? null,
      },
    })
  }),
)
