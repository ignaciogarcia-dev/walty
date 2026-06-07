import { describe, expect, it } from "vitest"
import {
  mpcRoundMessage,
  mpcAbortMessage,
  parseMpcRoundMessage,
  CEREMONY_TYPES,
  MPC_PAYLOAD_MAX_BYTES,
  type MpcRoundMessage,
  type MpcAbortMessage,
} from "@walty/shared/mpc/messages"

// ---- helpers ----------------------------------------------------------------

const VALID_UUID_A = "123e4567-e89b-12d3-a456-426614174000"
const VALID_UUID_B = "223e4567-e89b-12d3-a456-426614174001"

function validRound(overrides?: Partial<MpcRoundMessage>): MpcRoundMessage {
  return {
    ceremonyId: VALID_UUID_A,
    keyId: VALID_UUID_B,
    ceremonyType: "dkg",
    partyId: 1,
    round: 0,
    sequence: 0,
    expiresAt: Date.now() + 60_000,
    payload: "AAEC",          // short valid base64
    ...overrides,
  }
}

function validAbort(overrides?: Partial<MpcAbortMessage>): MpcAbortMessage {
  return {
    ceremonyId: VALID_UUID_A,
    keyId: VALID_UUID_B,
    reason: "user cancelled",
    ...overrides,
  }
}

// ---- mpcRoundMessage --------------------------------------------------------

describe("mpcRoundMessage", () => {
  describe("valid messages", () => {
    it("accepts a fully valid round-0 dkg message", () => {
      expect(() => mpcRoundMessage.parse(validRound())).not.toThrow()
    })

    it("accepts ceremony type 'sign'", () => {
      expect(() => mpcRoundMessage.parse(validRound({ ceremonyType: "sign" }))).not.toThrow()
    })

    it("accepts ceremony type 'refresh'", () => {
      expect(() => mpcRoundMessage.parse(validRound({ ceremonyType: "refresh" }))).not.toThrow()
    })

    it("accepts partyId = 0", () => {
      expect(() => mpcRoundMessage.parse(validRound({ partyId: 0 }))).not.toThrow()
    })

    it("accepts a payload at exactly the max size", () => {
      const maxPayload = "A".repeat(MPC_PAYLOAD_MAX_BYTES)
      expect(() => mpcRoundMessage.parse(validRound({ payload: maxPayload }))).not.toThrow()
    })

    it("returns the parsed object with all fields", () => {
      const msg = validRound({ round: 3, sequence: 7 })
      const result = mpcRoundMessage.parse(msg)
      expect(result.round).toBe(3)
      expect(result.sequence).toBe(7)
      expect(result.ceremonyType).toBe("dkg")
    })
  })

  describe("ceremonyId validation", () => {
    it("rejects a non-uuid ceremonyId", () => {
      expect(() => mpcRoundMessage.parse(validRound({ ceremonyId: "not-a-uuid" }))).toThrow()
    })

    it("rejects an empty ceremonyId", () => {
      expect(() => mpcRoundMessage.parse(validRound({ ceremonyId: "" }))).toThrow()
    })

    it("rejects a missing ceremonyId", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ceremonyId: _, ...rest } = validRound() as any
      expect(() => mpcRoundMessage.parse(rest)).toThrow()
    })
  })

  describe("keyId validation", () => {
    it("rejects a non-uuid keyId", () => {
      expect(() => mpcRoundMessage.parse(validRound({ keyId: "bad-key-id" }))).toThrow()
    })

    it("rejects a missing keyId", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { keyId: _, ...rest } = validRound() as any
      expect(() => mpcRoundMessage.parse(rest)).toThrow()
    })
  })

  describe("ceremonyType validation", () => {
    it("rejects an unknown ceremony type", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => mpcRoundMessage.parse(validRound({ ceremonyType: "keygen" as any }))).toThrow()
    })

    it("rejects a missing ceremonyType", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ceremonyType: _, ...rest } = validRound() as any
      expect(() => mpcRoundMessage.parse(rest)).toThrow()
    })

    it("covers all three valid ceremony types", () => {
      expect(CEREMONY_TYPES).toContain("dkg")
      expect(CEREMONY_TYPES).toContain("sign")
      expect(CEREMONY_TYPES).toContain("refresh")
      expect(CEREMONY_TYPES).toHaveLength(3)
    })
  })

  describe("partyId validation", () => {
    it("rejects a negative partyId", () => {
      expect(() => mpcRoundMessage.parse(validRound({ partyId: -1 }))).toThrow()
    })

    it("rejects a non-integer partyId", () => {
      expect(() => mpcRoundMessage.parse(validRound({ partyId: 1.5 }))).toThrow()
    })

    it("rejects a missing partyId", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { partyId: _, ...rest } = validRound() as any
      expect(() => mpcRoundMessage.parse(rest)).toThrow()
    })
  })

  describe("round validation", () => {
    it("rejects a negative round", () => {
      expect(() => mpcRoundMessage.parse(validRound({ round: -1 }))).toThrow()
    })

    it("rejects a non-integer round", () => {
      expect(() => mpcRoundMessage.parse(validRound({ round: 0.5 }))).toThrow()
    })
  })

  describe("sequence validation", () => {
    it("rejects a negative sequence", () => {
      expect(() => mpcRoundMessage.parse(validRound({ sequence: -1 }))).toThrow()
    })

    it("rejects a non-integer sequence", () => {
      expect(() => mpcRoundMessage.parse(validRound({ sequence: 2.2 }))).toThrow()
    })
  })

  describe("expiresAt validation", () => {
    it("rejects a non-positive expiresAt", () => {
      expect(() => mpcRoundMessage.parse(validRound({ expiresAt: 0 }))).toThrow()
    })

    it("rejects a negative expiresAt", () => {
      expect(() => mpcRoundMessage.parse(validRound({ expiresAt: -1 }))).toThrow()
    })

    it("rejects a non-integer expiresAt", () => {
      expect(() => mpcRoundMessage.parse(validRound({ expiresAt: 1.5 }))).toThrow()
    })
  })

  describe("payload validation", () => {
    it("rejects a payload exceeding the cap", () => {
      const oversized = "A".repeat(MPC_PAYLOAD_MAX_BYTES + 1)
      expect(() => mpcRoundMessage.parse(validRound({ payload: oversized }))).toThrow()
    })

    it("rejects a missing payload", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { payload: _, ...rest } = validRound() as any
      expect(() => mpcRoundMessage.parse(rest)).toThrow()
    })
  })

  describe("missing fields", () => {
    it("rejects an empty object", () => {
      expect(() => mpcRoundMessage.parse({})).toThrow()
    })

    it("rejects null", () => {
      expect(() => mpcRoundMessage.parse(null)).toThrow()
    })
  })
})

// ---- mpcAbortMessage --------------------------------------------------------

describe("mpcAbortMessage", () => {
  it("accepts a valid abort message", () => {
    expect(() => mpcAbortMessage.parse(validAbort())).not.toThrow()
  })

  it("rejects a non-uuid ceremonyId", () => {
    expect(() => mpcAbortMessage.parse(validAbort({ ceremonyId: "bad" }))).toThrow()
  })

  it("rejects a non-uuid keyId", () => {
    expect(() => mpcAbortMessage.parse(validAbort({ keyId: "bad" }))).toThrow()
  })

  it("rejects a reason exceeding 200 chars", () => {
    expect(() => mpcAbortMessage.parse(validAbort({ reason: "x".repeat(201) }))).toThrow()
  })

  it("accepts a reason of exactly 200 chars", () => {
    expect(() => mpcAbortMessage.parse(validAbort({ reason: "x".repeat(200) }))).not.toThrow()
  })

  it("rejects a missing reason", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { reason: _, ...rest } = validAbort() as any
    expect(() => mpcAbortMessage.parse(rest)).toThrow()
  })

  it("rejects a missing ceremonyId", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ceremonyId: _, ...rest } = validAbort() as any
    expect(() => mpcAbortMessage.parse(rest)).toThrow()
  })
})

// ---- parseMpcRoundMessage ---------------------------------------------------

describe("parseMpcRoundMessage", () => {
  it("returns the parsed message for valid input", () => {
    const msg = validRound()
    const result = parseMpcRoundMessage(msg)
    expect(result.ceremonyId).toBe(msg.ceremonyId)
    expect(result.keyId).toBe(msg.keyId)
    expect(result.ceremonyType).toBe("dkg")
  })

  it("throws a ZodError for invalid input", () => {
    expect(() => parseMpcRoundMessage({ ceremonyId: "bad" })).toThrow()
  })

  it("throws for null input", () => {
    expect(() => parseMpcRoundMessage(null)).toThrow()
  })
})
