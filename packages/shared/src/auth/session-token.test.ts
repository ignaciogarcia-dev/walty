import jwt from "jsonwebtoken"
import { beforeAll, describe, expect, it } from "vitest"

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-which-is-long-enough-32!"
  process.env.NODE_ENV = "test"
})

const { signSessionToken, verifySessionToken } = await import("./session-token")

describe("session-token", () => {
  it("round-trips userId + sid", () => {
    const token = signSessionToken({ userId: 7, sid: "abc-123" })
    expect(verifySessionToken(token)).toEqual({ userId: 7, sid: "abc-123" })
  })

  it("omits sid when not provided", () => {
    const token = signSessionToken({ userId: 7 })
    const decoded = verifySessionToken(token)
    expect(decoded.userId).toBe(7)
    expect(decoded.sid).toBeUndefined()
  })

  it("reads a legacy token (no sid) as userId only", () => {
    const legacy = jwt.sign({ userId: 42 }, process.env.JWT_SECRET!, {
      algorithm: "HS256",
      expiresIn: 3600,
    })
    expect(verifySessionToken(legacy)).toEqual({ userId: 42 })
  })

  it("ignores a non-string sid claim", () => {
    const weird = jwt.sign({ userId: 1, sid: 99 }, process.env.JWT_SECRET!, {
      algorithm: "HS256",
      expiresIn: 3600,
    })
    expect(verifySessionToken(weird)).toEqual({ userId: 1 })
  })

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign({ userId: 1, sid: "x" }, "some-other-secret", {
      algorithm: "HS256",
      expiresIn: 3600,
    })
    expect(() => verifySessionToken(forged)).toThrow()
  })

  it("rejects a token without a numeric userId", () => {
    const bad = jwt.sign({ sid: "x" }, process.env.JWT_SECRET!, {
      algorithm: "HS256",
      expiresIn: 3600,
    })
    expect(() => verifySessionToken(bad)).toThrow("Invalid token payload")
  })
})
