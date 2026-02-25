import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"

export interface AuthPayload {
  userId: string
  email: string
}

export function requireAuth(req: NextRequest): AuthPayload {
  const auth = req.headers.get("authorization")
  if (!auth) throw new Error("Unauthorized")

  const token = auth.split(" ")[1]
  return jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
}
