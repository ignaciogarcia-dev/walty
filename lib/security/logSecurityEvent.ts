import type { Actor } from "@/lib/permissions"

export function logSecurityEvent(event: {
  actor: Actor
  action: string
  result: "denied_permission" | "denied_policy"
  reason: string
  resourceId?: string | number
  ip?: string
  path?: string
}) {
  console.warn("[SECURITY]", JSON.stringify({
    ...event,
    actor: event.actor.type === "user"
      ? { userId: event.actor.user.userId }
      : { agentId: event.actor.agentId },
    timestamp: new Date().toISOString(),
  }))
}
