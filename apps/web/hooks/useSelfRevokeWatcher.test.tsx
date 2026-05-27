import { renderHook, waitFor, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Handler = (...args: unknown[]) => void

class FakeSocket {
  private handlers = new Map<string, Set<Handler>>()
  on(event: string, h: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(h)
  }
  off(event: string, h: Handler) {
    this.handlers.get(event)?.delete(h)
  }
  push(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload))
  }
  reset() {
    this.handlers = new Map()
  }
}

const socket = new FakeSocket()
const clearStoredWalletMock = vi.fn(async () => {})

vi.mock("@/lib/ws/socketClient", () => ({
  getNamespaceSocket: () => socket,
}))
vi.mock("@/lib/wallet-store", () => ({
  clearStoredWallet: clearStoredWalletMock,
}))

const { useSelfRevokeWatcher } = await import("./useSelfRevokeWatcher")

const fetchMock = vi.fn()
const assignMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  clearStoredWalletMock.mockClear()
  assignMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
  Object.defineProperty(window, "location", {
    value: { assign: assignMock },
    writable: true,
  })
})

afterEach(() => {
  socket.reset()
  vi.unstubAllGlobals()
})

describe("useSelfRevokeWatcher", () => {
  it("wipes and redirects when its own sid is revoked", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { sid: "mine" } }) })
      .mockResolvedValueOnce({ ok: true })

    renderHook(() => useSelfRevokeWatcher())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/session"))

    await act(async () => {
      socket.push("device:revoked", { sid: "mine" })
      await Promise.resolve()
    })

    await waitFor(() => expect(clearStoredWalletMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    })
    expect(assignMock).toHaveBeenCalledWith("/onboarding/login?revoked=1")
  })

  it("ignores revoke events for a different sid", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { sid: "mine" } }),
    })
    renderHook(() => useSelfRevokeWatcher())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      socket.push("device:revoked", { sid: "someone-else" })
      await Promise.resolve()
    })

    expect(clearStoredWalletMock).not.toHaveBeenCalled()
    expect(assignMock).not.toHaveBeenCalled()
  })
})
