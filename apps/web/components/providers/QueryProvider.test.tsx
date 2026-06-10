import { afterEach, describe, expect, it, vi } from "vitest"

const reportError = vi.fn()
vi.mock("@/lib/observability/report", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}))

import { createQueryClient } from "./QueryProvider"

afterEach(() => reportError.mockClear())

describe("createQueryClient error reporting", () => {
  it("reports a failed query through reportError", async () => {
    const client = createQueryClient()
    await client
      .fetchQuery({
        queryKey: ["boom"],
        queryFn: async () => {
          throw new Error("query failed")
        },
        retry: false,
      })
      .catch(() => {})

    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][1]).toMatchObject({ source: "react-query" })
  })

  it("reports a failed mutation through reportError", async () => {
    const client = createQueryClient()
    const mutation = client.getMutationCache().build(client, {
      mutationFn: async () => {
        throw new Error("mutation failed")
      },
      retry: false,
    })
    await mutation.execute(undefined).catch(() => {})

    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][1]).toMatchObject({ source: "react-query" })
  })
})
