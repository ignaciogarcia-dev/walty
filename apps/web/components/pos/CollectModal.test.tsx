import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en" }),
}))
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))

const hookState = {
  step: "amount" as const,
  request: null,
  amount: "",
  isSplitPayment: false,
  error: null,
  creating: false,
  amountValid: false,
  copiedAddress: false,
  copiedLink: false,
  requestStatus: "pending" as const,
  countdown: { expired: false, label: "--:--", seconds: 0 },
  refundState: "idle" as const,
  refundError: null,
  setIsSplitPayment: vi.fn(),
  setRefundState: vi.fn(),
  handleAmountChange: vi.fn(),
  handleCreateRequest: vi.fn(),
  handleRefundSurplus: vi.fn(),
  handleCopyAddress: vi.fn(),
  handleCopyLink: vi.fn(),
  resetLocalState: vi.fn(),
  handleClose: vi.fn(),
}
vi.mock("@/hooks/useCollectPayment", () => ({
  useCollectPayment: () => hookState,
}))

import { CollectModal } from "./CollectModal"

afterEach(cleanup)

describe("CollectModal", () => {
  it("renders the amount step through its subcomponent", () => {
    render(
      <CollectModal
        open
        onOpenChange={vi.fn()}
        merchantWalletAddress={"0x" + "1".repeat(40)}
      />,
    )
    expect(screen.getByText("collect-title")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "continue" }),
    ).toBeInTheDocument()
  })
})
