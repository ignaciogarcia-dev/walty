import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setReportingEnabled } from "./consent"
import type { ScrubbedError } from "./scrub"
import type { ErrorSink } from "./sink"
import { reportError, resetSink, setSink, shouldReport } from "./report"

const DSN_VAR = "NEXT_PUBLIC_ERROR_REPORTING_DSN"

function fakeSink() {
  const calls: ScrubbedError[] = []
  const sink: ErrorSink = { capture: (p) => calls.push(p) }
  return { sink, calls }
}

describe("reportError", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    resetSink()
    vi.unstubAllEnvs()
  })

  it("dispatches a scrubbed payload to the active sink", () => {
    const { sink, calls } = fakeSink()
    setSink(sink)
    reportError(new Error("boom ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"))
    expect(calls).toHaveLength(1)
    expect(calls[0].message).toContain("boom")
    expect(calls[0].message).not.toContain("ac0974")
  })

  it("forwards allowlisted context as tags", () => {
    const { sink, calls } = fakeSink()
    setSink(sink)
    reportError(new Error("x"), { boundary: "pay", secret: "leak-me" })
    expect(calls[0].tags).toEqual({ boundary: "pay" })
  })

  it("never throws even if the sink throws", () => {
    setSink({ capture: () => { throw new Error("sink down") } })
    expect(() => reportError(new Error("boom"))).not.toThrow()
  })

  it("in production stays silent without a DSN or consent", () => {
    vi.stubEnv("NODE_ENV", "production")
    const { sink, calls } = fakeSink()
    setSink(sink)
    reportError(new Error("boom"))
    expect(calls).toHaveLength(0)
  })

  it("in production reports only with both a DSN and consent", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv(DSN_VAR, "https://example.dsn")
    const { sink, calls } = fakeSink()
    setSink(sink)

    reportError(new Error("no consent yet"))
    expect(calls).toHaveLength(0)

    setReportingEnabled(true)
    reportError(new Error("now consented"))
    expect(calls).toHaveLength(1)
  })
})

describe("shouldReport", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("is true in development so devs see errors locally", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(shouldReport()).toBe(true)
  })
})
