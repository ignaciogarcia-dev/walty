import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"

export interface AuthPayload {
  userId: string
  email: string
}

export function requireAuth(req: NextRequest): AuthPayload {
  const token = req.cookies.get("token")?.value
  if (!token) throw new Error("Unauthorized")
  return jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
}
