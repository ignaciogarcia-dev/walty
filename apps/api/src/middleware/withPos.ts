import type { NextFunction, Request, RequestHandler, Response } from "express"
import { eq } from "drizzle-orm"
import { db, posDevices, posRequestNonces } from "@walty/db"
import { AuthError, ForbiddenError } from "@walty/shared/api-utils/errors"
import { getIp } from "@walty/shared/api-utils/get-ip"
import { isUniqueViolation } from "@walty/shared/db-errors"
import type { BusinessContext } from "@walty/shared/business/getBusinessContext"
import { hasPermission, type Permission } from "@walty/shared/permissions"
import { logSecurityEvent } from "@walty/shared/security/logSecurityEvent"
import { asyncHandler } from "./asyncHandler.js"
import {
  POS_HEADERS,
  POS_SIGNATURE_WINDOW_MS,
  buildPosSigningString,
  sha256Hex,
  verifyPosSignature,
} from "../lib/posSignature.js"

export type PosContext = {
  id: number
  businessId: number
  name: string
  derivationIndex: number
  walletAddress: string
}

declare module "express-serve-static-core" {
  interface Request {
    pos?: PosContext
    rawBody?: Buffer
  }
}

function header(req: Request, name: string): string | null {
  const v = req.header(name)
  return typeof v === "string" && v.length > 0 ? v : null
}

/**
 * Authenticates a headless POS device by verifying the Ed25519 signature it
 * attaches to the request, then builds the owning business context (as a
 * non-owner scoped to the device's derived child wallet) and an agent actor.
 *
 * Steps: load device by id → timestamp freshness → signature over the canonical
 * string → nonce anti-replay → mark active/last-seen → attach req.pos /
 * req.business / req.actor.
 */
export const verifyPos: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const ip = getIp(req)
    const posId = header(req, POS_HEADERS.id)
    const timestamp = header(req, POS_HEADERS.timestamp)
    const nonce = header(req, POS_HEADERS.nonce)
    const signature = header(req, POS_HEADERS.signature)

    if (!posId || !timestamp || !nonce || !signature) {
      throw new AuthError()
    }

    const idNum = Number(posId)
    if (!Number.isInteger(idNum) || idNum <= 0) throw new AuthError()

    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) throw new AuthError()
    if (Math.abs(Date.now() - ts) > POS_SIGNATURE_WINDOW_MS) {
      logSecurityEvent({
        actor: { type: "agent", agentId: posId },
        action: "pos_auth",
        result: "denied_policy",
        reason: "timestamp_out_of_window",
        ip,
        path: req.path,
      })
      throw new AuthError()
    }

    const [device] = await db
      .select()
      .from(posDevices)
      .where(eq(posDevices.id, idNum))
      .limit(1)

    if (!device || device.status === "revoked") throw new AuthError()

    const message = buildPosSigningString({
      method: req.method,
      path: req.path,
      bodyHashHex: sha256Hex(req.rawBody ?? Buffer.alloc(0)),
      timestamp,
      nonce,
    })

    if (!verifyPosSignature(device.publicKey, message, signature)) {
      logSecurityEvent({
        actor: { type: "agent", agentId: posId },
        action: "pos_auth",
        result: "denied_policy",
        reason: "invalid_signature",
        ip,
        path: req.path,
      })
      throw new AuthError()
    }

    // Anti-replay: a repeated nonce violates the unique(posDeviceId, nonce)
    // constraint. Only recorded after the signature checks out, so an attacker
    // cannot flood the table with unsigned requests.
    try {
      await db.insert(posRequestNonces).values({
        posDeviceId: device.id,
        nonce,
        expiresAt: new Date(Date.now() + 2 * POS_SIGNATURE_WINDOW_MS),
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        logSecurityEvent({
          actor: { type: "agent", agentId: posId },
          action: "pos_auth",
          result: "denied_policy",
          reason: "replayed_nonce",
          ip,
          path: req.path,
        })
        throw new AuthError()
      }
      throw err
    }

    // First successful request "links" the terminal; always refresh last-seen.
    await db
      .update(posDevices)
      .set({
        lastSeenAt: new Date(),
        ...(device.status === "pending" ? { status: "active" as const } : {}),
      })
      .where(eq(posDevices.id, device.id))

    const business: BusinessContext = {
      businessId: device.businessId,
      role: "cashier",
      isOwner: false,
      walletAddress: device.walletAddress,
    }

    req.pos = {
      id: device.id,
      businessId: device.businessId,
      name: device.name,
      derivationIndex: device.derivationIndex,
      walletAddress: device.walletAddress,
    }
    req.business = business
    req.actor = { type: "agent", agentId: String(device.id) }
    req.clientIp = ip
    next()
  },
)

export function withPosPermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const actor = req.actor
    const business = req.business
    if (!actor || actor.type !== "agent" || !business) {
      next(new ForbiddenError(permission))
      return
    }
    if (!hasPermission(actor, permission, { businessContext: business })) {
      logSecurityEvent({
        actor,
        action: permission,
        result: "denied_permission",
        reason: "missing_permission",
        ip: getIp(req),
        path: req.path,
      })
      next(new ForbiddenError(permission))
      return
    }
    next()
  }
}

/**
 * Composes POS signature auth + permission check into a middleware list to
 * spread into router.METHOD(path, ...withPosAuth(P), handler).
 */
export function withPosAuth(permission: Permission): RequestHandler[] {
  return [verifyPos, withPosPermission(permission)]
}
