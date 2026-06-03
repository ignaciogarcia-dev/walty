import { renderHook, act, waitFor } from "@testing-library/react"
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

vi.mock("@/lib/ws/socketClient", () => ({
  getNamespaceSocket: () => socket,
}))

const { useDevices } = await import("./useDevices")

const fetchMock = vi.fn()

function deviceListResponse(devices: object[]) {
  return { ok: true, json: async () => ({ devices }) }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  socket.reset()
  vi.unstubAllGlobals()
})

describe("useDevices", () => {
  it("loads the initial list", async () => {
    fetchMock.mockResolvedValueOnce(
      deviceListResponse([
        {
          id: "d1",
          label: "Laptop",
          trusted: true,
          lastSeenAt: "2026-05-27",
          createdAt: "2026-05-01",
          current: true,
        },
      ]),
    )
    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.devices).toHaveLength(1)
    expect(result.current.devices[0].label).toBe("Laptop")
  })

  it("refetches when device:list-changed fires", async () => {
    fetchMock
      .mockResolvedValueOnce(deviceListResponse([]))
      .mockResolvedValueOnce(
        deviceListResponse([
          { id: "d2", label: "Phone", trusted: false, lastSeenAt: "", createdAt: "", current: false },
        ]),
      )
    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.devices).toHaveLength(0)

    await act(async () => {
      socket.push("device:list-changed", {})
    })
    await waitFor(() => expect(result.current.devices).toHaveLength(1))
  })

  it("rename hits PATCH /api/devices/:sid", async () => {
    fetchMock
      .mockResolvedValueOnce(deviceListResponse([]))
      .mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.renameDevice("sid-1", "Office laptop")
    })

    expect(fetchMock).toHaveBeenLastCalledWith("/api/devices/sid-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Office laptop" }),
    })
  })

  it("revoke hits POST /api/devices/:sid/revoke", async () => {
    fetchMock
      .mockResolvedValueOnce(deviceListResponse([]))
      .mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.revokeDevice("sid-2")
    })

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/devices/sid-2/revoke",
      { method: "POST" },
    )
  })

  it("surfaces a fetch error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })
    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("devices-fetch-failed")
  })
})
