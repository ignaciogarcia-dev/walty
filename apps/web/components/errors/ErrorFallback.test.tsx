import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ErrorFallback } from "./ErrorFallback"

afterEach(cleanup)

vi.mock("@/components/locale/provider", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}))

describe("ErrorFallback", () => {
  it("shows the localized title and description", () => {
    render(<ErrorFallback reset={vi.fn()} />)
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
  })

  it("calls reset when the retry button is clicked", () => {
    const reset = vi.fn()
    render(<ErrorFallback reset={reset} />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
