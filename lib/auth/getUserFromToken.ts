import { cookies } from "next/headers"
import jwt from "jsonwebtoken"

export interface TokenPayload {
  userId: number
  userType: "person" | "business"
}

export async function getUserFromToken(): Promise<TokenPayload | null> {
  const token = (await cookies()).get("token")?.value
  if (!token) return null
  
  // Decode only — middleware already verified the signature
  const decoded = jwt.decode(token) as TokenPayload | null
  return decoded
}
