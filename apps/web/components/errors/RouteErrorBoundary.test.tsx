import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const reportError = vi.fn()
vi.mock("@/lib/observability/report", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}))
vi.mock("@/components/locale/provider", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}))

import { RouteErrorBoundary } from "./RouteErrorBoundary"

afterEach(() => {
  cleanup()
  reportError.mockClear()
})

describe("RouteErrorBoundary", () => {
  it("reports the error with its boundary tag and digest on mount", () => {
    const error = Object.assign(new Error("kaboom"), { digest: "d1" })
    render(<RouteErrorBoundary error={error} reset={vi.fn()} boundary="pay" />)
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][1]).toMatchObject({
      boundary: "pay",
      digest: "d1",
    })
  })

  it("renders the shared fallback UI", () => {
    render(
      <RouteErrorBoundary
        error={new Error("x")}
        reset={vi.fn()}
        boundary="dashboard"
      />,
    )
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
  })
})
