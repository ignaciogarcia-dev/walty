// apps/web/scripts/mpc-device-spike/serverSim.ts
//
// IN-BROWSER simulation of the SERVER party (party 1), used ONLY by the device
// spike to drive the protocol end-to-end without a network. It mirrors the
// round logic of apps/api/src/services/mpc/ceremony.ts (stepDkg / stepSign /
// stepRefresh) and MpcServerParty, but built against `-ll-web` and the SAME
// bundle codec the production device wrapper uses. This lets us exercise the
// real MpcDeviceParty + codec in a real browser.
//
// It is NOT production code and lives under scripts/ deliberately.

import {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-web"

const SERVER_PARTY_ID = 1
const PARTICIPANTS = 3
const THRESHOLD = 2
const COMMITMENT_SENTINEL = 0xfe
const BROADCAST_SENTINEL = 0xff

// ---- bundle codec (identical to MpcDeviceParty / ceremony.ts) ----
function b64encode(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export function encodeBundle(frames: Uint8Array[]): string {
  const arr = frames.map((f) => b64encode(f))
  return btoa(unescape(encodeURIComponent(JSON.stringify(arr))))
}
export function decodeBundle(payloadB64: string): Uint8Array[] {
  const parsed = JSON.parse(decodeURIComponent(escape(atob(payloadB64)))) as string[]
  return parsed.map((s) => b64decode(s))
}

// ---- wire helpers ----
function serializeMessage(msg: Message): Uint8Array {
  const payload = msg.payload
  const result = new Uint8Array(2 + payload.length)
  result[0] = msg.from_id
  result[1] = msg.to_id === undefined ? BROADCAST_SENTINEL : msg.to_id
  result.set(payload, 2)
  msg.free()
  return result
}
function deserializeMessage(raw: Uint8Array): Message {
  const from = raw[0]
  const toRaw = raw[1]
  const payload = raw.slice(2)
  const to = toRaw === BROADCAST_SENTINEL ? undefined : toRaw
  return new Message(payload, from, to)
}
function encodeCommitment(fromPartyId: number, c: Uint8Array): Uint8Array {
  const result = new Uint8Array(2 + c.length)
  result[0] = fromPartyId
  result[1] = COMMITMENT_SENTINEL
  result.set(c, 2)
  return result
}
function filterMessages(msgs: Message[], party: number): Message[] {
  return msgs.filter((m) => m.from_id !== party).map((m) => m.clone())
}
function selectMessages(msgs: Message[], party: number): Message[] {
  return msgs.filter((m) => m.to_id === party).map((m) => m.clone())
}
function splitInbound(inbound: Uint8Array[]): {
  messages: Message[]
  commitments: Map<number, Uint8Array>
} {
  const messages: Message[] = []
  const commitments = new Map<number, Uint8Array>()
  for (const raw of inbound) {
    if (raw[1] === COMMITMENT_SENTINEL) commitments.set(raw[0], raw.slice(2))
    else messages.push(deserializeMessage(raw))
  }
  return { messages, commitments }
}
function freeMsgs(msgs: Message[]): void {
  for (const m of msgs) {
    try {
      m.free()
    } catch {
      /* */
    }
  }
}

// ---------------------------------------------------------------------------
// Keygen / refresh server driver (mirrors MpcServerKeygen + ceremony.stepDkg)
// ---------------------------------------------------------------------------

class ServerKeygen {
  private session: KeygenSession
  private round = 0
  private commitment: Uint8Array | null = null
  private peerCommitments = new Map<number, Uint8Array>()

  constructor(session: KeygenSession) {
    this.session = session
  }

  static dkg(): ServerKeygen {
    return new ServerKeygen(new KeygenSession(PARTICIPANTS, THRESHOLD, SERVER_PARTY_ID))
  }
  static refresh(oldShareBytes: Uint8Array): ServerKeygen {
    const old = Keyshare.fromBytes(oldShareBytes)
    return new ServerKeygen(KeygenSession.initKeyRotation(old))
  }

  /** Server's first outbound bundle (round 0). */
  firstBundle(): string {
    const msg = serializeMessage(this.session.createFirstMessage())
    this.round = 1
    return encodeBundle([msg])
  }

  /** Advance one round given the client's bundle; returns server outbound. */
  step(clientBundle: string): { outboundBundle: string; done: boolean; shareBytes?: Uint8Array } {
    const inbound = decodeBundle(clientBundle)
    for (const raw of inbound) {
      if (raw[1] === COMMITMENT_SENTINEL) this.peerCommitments.set(raw[0], raw.slice(2))
    }

    if (this.round === 1) {
      const { messages } = splitInbound(inbound)
      try {
        const r2 = this.session.handleMessages(filterMessages(messages, SERVER_PARTY_ID))
        this.commitment = this.session.calculateChainCodeCommitment()
        this.round = 2
        const frames = r2.map(serializeMessage)
        frames.push(encodeCommitment(SERVER_PARTY_ID, this.commitment))
        return { outboundBundle: encodeBundle(frames), done: false }
      } finally {
        freeMsgs(messages)
      }
    }
    if (this.round === 2) {
      const { messages } = splitInbound(inbound)
      try {
        const r3 = this.session.handleMessages(selectMessages(messages, SERVER_PARTY_ID))
        this.round = 3
        return { outboundBundle: encodeBundle(r3.map(serializeMessage)), done: false }
      } finally {
        freeMsgs(messages)
      }
    }
    if (this.round === 3) {
      const { messages } = splitInbound(inbound)
      try {
        if (!this.commitment) throw new Error("server commitment missing")
        const commitMap = new Map(this.peerCommitments)
        commitMap.set(SERVER_PARTY_ID, this.commitment)
        const maxId = Math.max(...commitMap.keys())
        const all: Uint8Array[] = []
        for (let i = 0; i <= maxId; i++) {
          const c = commitMap.get(i)
          if (!c) throw new Error(`server: missing commitment ${i}`)
          all.push(c)
        }
        const r4 = this.session.handleMessages(selectMessages(messages, SERVER_PARTY_ID), all)
        this.round = 4
        return { outboundBundle: encodeBundle(r4.map(serializeMessage)), done: false }
      } finally {
        freeMsgs(messages)
      }
    }
    if (this.round === 4) {
      const { messages } = splitInbound(inbound)
      try {
        this.session.handleMessages(filterMessages(messages, SERVER_PARTY_ID))
        this.round = 5
        const ks = this.session.keyshare()
        const shareBytes = ks.toBytes()
        ks.free()
        return { outboundBundle: encodeBundle([]), done: true, shareBytes }
      } finally {
        freeMsgs(messages)
      }
    }
    throw new Error(`ServerKeygen: unexpected round ${this.round}`)
  }

  free(): void {
    try {
      this.session.free()
    } catch {
      /* */
    }
  }
}

// ---------------------------------------------------------------------------
// Sign server driver (mirrors MpcServerSign + ceremony.stepSign)
// ---------------------------------------------------------------------------

class ServerSign {
  private session: SignSession
  private round = 1
  private lastSent = false
  private hash: Uint8Array

  constructor(serverShareBytes: Uint8Array, hash: Uint8Array) {
    const ks = Keyshare.fromBytes(serverShareBytes)
    this.session = new SignSession(ks, "m")
    this.hash = hash
  }

  firstBundle(): string {
    const msg = serializeMessage(this.session.createFirstMessage())
    return encodeBundle([msg])
  }

  step(clientBundle: string): { outboundBundle: string; done: boolean } {
    const inbound = decodeBundle(clientBundle)
    const { messages } = splitInbound(inbound)
    try {
      if (this.lastSent) {
        // already combined client side; server just needs to combine too — but
        // for the spike the device produces the final signature, so the server
        // only needs to have emitted its last message. Nothing more to do.
        return { outboundBundle: encodeBundle([]), done: true }
      }
      if (this.round === 1) {
        const r2 = this.session.handleMessages(filterMessages(messages, SERVER_PARTY_ID))
        this.round = 2
        return { outboundBundle: encodeBundle(r2.map(serializeMessage)), done: false }
      }
      if (this.round === 2) {
        const r3 = this.session.handleMessages(selectMessages(messages, SERVER_PARTY_ID))
        this.round = 3
        return { outboundBundle: encodeBundle(r3.map(serializeMessage)), done: false }
      }
      if (this.round === 3) {
        this.session.handleMessages(selectMessages(messages, SERVER_PARTY_ID))
        const last = serializeMessage(this.session.lastMessage(this.hash))
        this.round = 4
        this.lastSent = true
        return { outboundBundle: encodeBundle([last]), done: false }
      }
      throw new Error(`ServerSign: unexpected round ${this.round}`)
    } finally {
      freeMsgs(messages)
    }
  }

  free(): void {
    try {
      this.session.free()
    } catch {
      /* */
    }
  }
}

export { ServerKeygen, ServerSign }
