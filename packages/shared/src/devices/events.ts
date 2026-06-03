/**
 * WebSocket contract for the `/devices` namespace. The server pushes these to
 * the per-user room `user:<userId>` so every open device of an account reacts
 * to pairing and revocation changes in real time.
 */

export const DEVICES_NAMESPACE = "/devices" as const

export const DEVICE_EVENTS = {
  pairingRequested: "device:pairing-requested",
  pairingApproved: "device:pairing-approved",
  pairingRejected: "device:pairing-rejected",
  revoked: "device:revoked",
  listChanged: "device:list-changed",
} as const

export interface DevicePairingRequestedEvent {
  pairingId: string
  sessionId: string
  label: string
  requestIp: string | null
  createdAt: string
  expiresAt: string
}

export interface DevicePairingResolvedEvent {
  pairingId: string
}

export interface DeviceRevokedEvent {
  sid: string
}
