export type PolicyResult =
  | { allowed: true }
  | { allowed: false; reason: string }

export const allow: PolicyResult = { allowed: true }
export const deny = (reason: string): PolicyResult => ({ allowed: false, reason })
