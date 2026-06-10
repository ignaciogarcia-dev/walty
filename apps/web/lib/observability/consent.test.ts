import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isReportingEnabled, setReportingEnabled } from "./consent"

describe("reporting consent", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it("defaults to off (opt-in) when nothing is stored", () => {
    expect(isReportingEnabled()).toBe(false)
  })

  it("turns on and persists when enabled", () => {
    setReportingEnabled(true)
    expect(isReportingEnabled()).toBe(true)
  })

  it("turns back off", () => {
    setReportingEnabled(true)
    setReportingEnabled(false)
    expect(isReportingEnabled()).toBe(false)
  })

  it("treats a corrupt stored value as off", () => {
    localStorage.setItem("walty.errorReporting", "not-a-bool")
    expect(isReportingEnabled()).toBe(false)
  })
})
