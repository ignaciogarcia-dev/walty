import { SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";

const isProduction = process.env.NODE_ENV === "production";
const forceSecure = process.env.COOKIE_SECURE === "true";
const secure = isProduction || forceSecure;

export function setTokenCookie(token: string): string {
  return `token=${encodeURIComponent(token)}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

export function clearTokenCookie(): string {
  return `token=; HttpOnly;${secure ? " Secure;" : ""} SameSite=Strict; Path=/; Max-Age=0`;
}
