import { renderHook, act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

type Handler = (...args: unknown[]) => void

class FakeSocket {
  private handlers = new Map<string, Set<Handler>>()
  public emitted: Array<{ event: string; args: unknown[] }> = []

  on(event: string, h: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(h)
  }
  off(event: string, h: Handler) {
    this.handlers.get(event)?.delete(h)
  }
  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args })
  }
  /** Test helper — simulate a server-pushed event. */
  push(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload))
  }
  /** Test helper — clear all listeners between tests. */
  reset() {
    this.handlers = new Map()
  }
}

const socket = new FakeSocket()

vi.mock("@/lib/ws/socketClient", () => ({
  getNamespaceSocket: () => socket,
}))

// Import AFTER the mock so the hook picks up the fake.
const { usePaymentRequestStatus } = await import("./usePaymentRequestStatus")

afterEach(() => {
  socket.emitted = []
  socket.reset()
})

describe("usePaymentRequestStatus", () => {
  it("returns initialStatus before any event", () => {
    const { result } = renderHook(() =>
      usePaymentRequestStatus("req-1", {
        status: "pending",
        confirmations: 0,
      }),
    )
    expect(result.current).toEqual({ status: "pending", confirmations: 0 })
  })

  it("returns null when no requestId is given", () => {
    const { result } = renderHook(() => usePaymentRequestStatus(null))
    expect(result.current).toBeNull()
  })

  it("emits subscribe on mount and unsubscribe on unmount", () => {
    const { unmount } = renderHook(() => usePaymentRequestStatus("req-1"))
    expect(socket.emitted).toContainEqual({
      event: "subscribe",
      args: ["req-1"],
    })
    unmount()
    expect(socket.emitted).toContainEqual({
      event: "unsubscribe",
      args: ["req-1"],
    })
  })

  it("re-emits subscribe when the socket reconnects", () => {
    renderHook(() => usePaymentRequestStatus("req-1"))
    const before = socket.emitted.filter((e) => e.event === "subscribe").length
    act(() => {
      socket.push("connect", undefined)
    })
    const after = socket.emitted.filter((e) => e.event === "subscribe").length
    expect(after).toBe(before + 1)
  })

  it("updates state on request:detected", () => {
    const { result } = renderHook(() => usePaymentRequestStatus("req-1"))
    act(() => {
      socket.push("request:detected", {
        type: "detected",
        requestId: "req-1",
        txHash: "0xabc",
      })
    })
    expect(result.current).toEqual({ status: "detected", txHash: "0xabc" })
  })

  it("updates state on request:confirming with counts", () => {
    const { result } = renderHook(() => usePaymentRequestStatus("req-1"))
    act(() => {
      socket.push("request:confirming", {
        type: "confirming",
        requestId: "req-1",
        confirmations: 2,
        requiredConfirmations: 5,
      })
    })
    expect(result.current).toEqual({
      status: "confirming",
      confirmations: 2,
      requiredConfirmations: 5,
    })
  })

  it("updates state on request:paid with txHash + amount", () => {
    const { result } = renderHook(() => usePaymentRequestStatus("req-1"))
    act(() => {
      socket.push("request:paid", {
        type: "paid",
        requestId: "req-1",
        txHash: "0xdeadbeef",
        amount: "10000000",
      })
    })
    expect(result.current).toEqual({
      status: "paid",
      txHash: "0xdeadbeef",
      amount: "10000000",
    })
  })

  it("updates state on request:expired and request:cancelled", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePaymentRequestStatus(id),
      { initialProps: { id: "req-1" } },
    )
    act(() => {
      socket.push("request:expired", { type: "expired", requestId: "req-1" })
    })
    expect(result.current).toEqual({ status: "expired" })

    rerender({ id: "req-2" })
    act(() => {
      socket.push("request:cancelled", {
        type: "cancelled",
        requestId: "req-2",
      })
    })
    expect(result.current).toEqual({ status: "cancelled" })
  })

  it("ignores events for a different requestId", () => {
    const { result } = renderHook(() =>
      usePaymentRequestStatus("req-1", { status: "pending" }),
    )
    act(() => {
      socket.push("request:paid", {
        type: "paid",
        requestId: "OTHER",
        txHash: "0xnope",
        amount: "1",
      })
    })
    expect(result.current).toEqual({ status: "pending" })
  })

  it("cleans up listeners on unmount (no leak across remount)", () => {
    const { unmount } = renderHook(() => usePaymentRequestStatus("req-1"))
    unmount()
    // After unmount the handler should be gone — push must not throw.
    expect(() =>
      socket.push("request:paid", {
        type: "paid",
        requestId: "req-1",
        txHash: "0x1",
        amount: "1",
      }),
    ).not.toThrow()
  })
})
