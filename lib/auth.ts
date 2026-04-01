import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { AuthError } from "@/lib/api/errors";
import type { AuthPayload } from "./auth/payload";
import { verifySessionToken } from "./auth/session-token";

export type { AuthPayload } from "./auth/payload";

/**
 * Server components/layouts — reads JWT from cookies(), verifies signature.
 * Redirects to /onboarding if token is missing or invalid.
 */
export async function requireAuth(): Promise<AuthPayload> {
  const token = (await cookies()).get("token")?.value;
  if (!token) redirect("/onboarding");

  try {
    return verifySessionToken(token);
  } catch {
    redirect("/onboarding");
  }
}

/**
 * API route handlers — reads JWT from req.cookies, verifies signature.
 * Throws AuthError if token is missing or invalid (caught by withErrorHandling).
 */
export function requireApiAuth(req: NextRequest): AuthPayload {
  const token = req.cookies.get("token")?.value;
  if (!token) throw new AuthError();
  try {
    return verifySessionToken(token);
  } catch {
    throw new AuthError();
  }
}
