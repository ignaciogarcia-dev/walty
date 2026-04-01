import { allow, deny, type PolicyResult } from "./types"

export function canReactivateMember(member: { status: string }): PolicyResult {
  return member.status === "suspended" ? allow : deny("member_not_suspended")
}

export function canDeleteInvitation(member: { status: string }): PolicyResult {
  return member.status === "invited" ? allow : deny("member_not_invited")
}
