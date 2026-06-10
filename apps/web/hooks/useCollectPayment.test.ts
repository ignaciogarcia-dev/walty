import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"
import type { PaymentRequestView } from "@walty/shared/payments/types"
import { useCollectPayment } from "./useCollectPayment"

vi.mock("@/hooks/usePaymentRequestStatus", () => ({
  usePaymentRequestStatus: () => null,
}))
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en" }),
}))

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  Wrapper.displayName = "TestWrapper"
  return Wrapper
}

const MERCHANT = "0x" + "1".repeat(40)

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  merchantWalletAddress: MERCHANT as string | null,
  activeRequest: null as PaymentRequestView | null,
  onRequestChange: vi.fn(),
}

function setup(overrides: Partial<typeof baseProps> = {}) {
  return renderHook(() => useCollectPayment({ ...baseProps, ...overrides }), {
    wrapper: makeWrapper(),
  })
}

function fakeRequest(over: Partial<PaymentRequestView> = {}): PaymentRequestView {
  return {
    id: "req-1",
    amountUsd: "10.00",
    amountToken: "10000000",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    merchantWalletAddress: MERCHANT,
    status: "pending",
    isSplitPayment: false,
    ...over,
  } as PaymentRequestView
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useCollectPayment", () => {
  it("starts in the amount step with empty state", () => {
    const { result } = setup()
    expect(result.current.step).toBe("amount")
    expect(result.current.amount).toBe("")
    expect(result.current.refundState).toBe("idle")
  })

  it("validates the amount on change", () => {
    const { result } = setup()
    act(() => result.current.handleAmountChange("10"))
    expect(result.current.amount).toBe("10")
    expect(result.current.error).toBeNull()
    expect(result.current.amountValid).toBe(true)

    act(() => result.current.handleAmountChange("0"))
    expect(result.current.error).toBeTruthy()
    expect(result.current.amountValid).toBe(false)
  })

  it("resetLocalState returns to a clean amount step", () => {
    const { result } = setup()
    act(() => result.current.handleAmountChange("25"))
    act(() => result.current.resetLocalState())
    expect(result.current.step).toBe("amount")
    expect(result.current.amount).toBe("")
  })

  it("requires a merchant wallet before creating", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    const { result } = setup({ merchantWalletAddress: null })
    await act(async () => {
      await result.current.handleCreateRequest()
    })
    expect(result.current.error).toBe("unlock-wallet-to-collect")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("advances to the qr step after a successful create", async () => {
    const created = fakeRequest({ status: "pending" })
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: created }),
    } as Response)

    const { result } = setup()
    act(() => result.current.handleAmountChange("10"))
    await act(async () => {
      await result.current.handleCreateRequest()
    })

    expect(result.current.step).toBe("qr")
    expect(result.current.request?.id).toBe("req-1")
    expect(baseProps.onRequestChange).toHaveBeenCalledWith(created)
  })

  it("surfaces a server error on create and stays on the amount step", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "boom" }),
    } as Response)

    const { result } = setup()
    act(() => result.current.handleAmountChange("10"))
    await act(async () => {
      await result.current.handleCreateRequest()
    })

    expect(result.current.error).toBe("boom")
    expect(result.current.step).toBe("amount")
  })

  it("marks the surplus refund done on success", async () => {
    const paid = fakeRequest({
      status: "paid",
      payerAddress: "0x" + "2".repeat(40),
      receivedAmountToken: "12000000",
    })
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response)

    const { result } = setup({ activeRequest: paid })
    await waitFor(() => expect(result.current.request?.id).toBe("req-1"))

    await act(async () => {
      await result.current.handleRefundSurplus()
    })
    expect(result.current.refundState).toBe("done")
  })

  it("syncs an active request when opened", async () => {
    const active = fakeRequest({ status: "paid" })
    const { result } = setup({ activeRequest: active })
    await waitFor(() => {
      expect(result.current.request?.id).toBe("req-1")
      expect(result.current.step).toBe("confirmed")
    })
  })
})
