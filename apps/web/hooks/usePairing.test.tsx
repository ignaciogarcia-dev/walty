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
  emit() {}
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
vi.mock("@/lib/rpc/getWalletClient", () => ({
  getWalletClient: () => ({ signMessage: async () => "0xsig" }),
}))

const { usePairing } = await import("./usePairing")
const { usePairingApprovals } = await import("./usePairingApprovals")

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  socket.reset()
  vi.unstubAllGlobals()
})

describe("usePairing (pending device)", () => {
  it("requests a pairing and resolves true when approved", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => usePairing())

    let resolved: boolean | undefined
    await act(async () => {
      result.current.requestPairing().then((v) => {
        resolved = v
      })
    })

    await waitFor(() => expect(result.current.state).toBe("waiting"))
    expect(fetchMock).toHaveBeenCalledWith("/api/devices/pairing-requests", {
      method: "POST",
    })

    await act(async () => {
      socket.push("device:pairing-approved", { pairingId: "p1" })
    })
    await waitFor(() => expect(resolved).toBe(true))
    expect(result.current.state).toBe("approved")
  })

  it("resolves false when the pairing is rejected", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => usePairing())

    let resolved: boolean | undefined
    await act(async () => {
      result.current.requestPairing().then((v) => {
        resolved = v
      })
    })
    await waitFor(() => expect(result.current.state).toBe("waiting"))

    await act(async () => {
      socket.push("device:pairing-rejected", { pairingId: "p1" })
    })
    await waitFor(() => expect(resolved).toBe(false))
    expect(result.current.state).toBe("rejected")
  })

  it("throws and stays idle when the request fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })
    const { result } = renderHook(() => usePairing())
    await expect(result.current.requestPairing()).rejects.toThrow()
    expect(result.current.state).toBe("idle")
  })
})

describe("usePairingApprovals (trusted device)", () => {
  const security = {
    withUnlockedSeed: async (fn: (m: string) => unknown) => fn("seed words"),
  } as never

  it("accumulates incoming requests and drops them when resolved", async () => {
    const { result } = renderHook(() => usePairingApprovals(security))

    await act(async () => {
      socket.push("device:pairing-requested", {
        pairingId: "p1",
        label: "iPhone",
        requestIp: "1.2.3.4",
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      })
    })
    expect(result.current.incoming).toHaveLength(1)

    // Duplicate event must not double-add.
    await act(async () => {
      socket.push("device:pairing-requested", { pairingId: "p1", label: "x" })
    })
    expect(result.current.incoming).toHaveLength(1)

    await act(async () => {
      socket.push("device:pairing-approved", { pairingId: "p1" })
    })
    expect(result.current.incoming).toHaveLength(0)
  })

  it("approve signs a fresh challenge and posts it", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nonce: "n1" }) })
      .mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => usePairingApprovals(security))
    await act(async () => {
      socket.push("device:pairing-requested", {
        pairingId: "p1",
        label: "iPhone",
        requestIp: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      })
    })

    await act(async () => {
      await result.current.approve("p1")
    })

    expect(fetchMock).toHaveBeenCalledWith("/api/wallet/nonce", {
      method: "POST",
    })
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/devices/pairing-requests/p1/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ nonce: "n1", signature: "0xsig" }),
      }),
    )
    expect(result.current.incoming).toHaveLength(0)
  })
})
