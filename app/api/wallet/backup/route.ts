import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { walletBackups } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"
import { validateBackup as validateBackupShape } from "@/lib/wallet-backup/validation"

function validateBackup(data: unknown): void {
  try {
    validateBackupShape(data)
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : "Invalid backup")
  }
}

export const GET = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 5, 60_000)

  const backup = await db.query.walletBackups.findFirst({
    where: eq(walletBackups.userId, auth.userId),
  })

  if (!backup) return ok(null)

  return ok(backup.data)
}))

export const POST = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 5, 60_000)

  const body = await req.json()

  validateBackup(body)

  await db.insert(walletBackups)
    .values({
      userId: auth.userId,
      data: body,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: walletBackups.userId,
      set: {
        data: body,
        updatedAt: new Date(),
      },
    })

  return ok({ success: true })
}))
