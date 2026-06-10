// Opt-in gate for error reporting. Default OFF; SSR-safe (guards on `window`).

const STORAGE_KEY = "walty.errorReporting"

export function isReportingEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export function setReportingEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false")
  } catch {
    // private mode / storage disabled, reporting stays off.
  }
}
