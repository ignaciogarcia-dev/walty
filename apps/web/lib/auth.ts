import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthPayload } from "@walty/shared/auth/payload";
import { verifySessionToken } from "@walty/shared/auth/session-token";

export type { AuthPayload } from "@walty/shared/auth/payload";

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
