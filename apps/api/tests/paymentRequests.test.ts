import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

process.env.JWT_SECRET = "test-secret"
process.env.NODE_ENV = "test"

vi.mock("@walty/shared/rate-limit", () => ({
  rateLimitByIp: vi.fn(async () => {}),
  rateLimitByUser: vi.fn(async () => {}),
  RateLimitError: class RateLimitError extends Error {},
  cleanupExpiredEntries: vi.fn(async () => {}),
}))

vi.mock("@walty/shared/business/getBusinessContext", () => ({
  getBusinessContext: vi.fn(async () => ({
    businessId: 1,
    role: "owner",
    isOwner: true,
    walletAddress: null,
  })),
}))

vi.mock("@walty/shared/payments/reconcilePendingPaymentRequests", () => ({
  reconcilePendingPaymentRequests: vi.fn(async () => ({ paid: 0 })),
}))

const samplePr = {
  id: "abc",
  merchantId: 1,
  operatorId: null,
  chainId: 137,
  amountUsd: "10.00",
  amountToken: "10000000",
  tokenSymbol: "USDC",
  tokenAddress: "0x0000000000000000000000000000000000000000",
  tokenDecimals: 6,
  merchantWalletAddress: "0xabc",
  startBlock: "1",
  lastScannedBlock: "1",
  requiredConfirmations: 1,
  confirmations: 0,
  status: "pending",
  isSplitPayment: false,
  totalPaidToken: null,
  totalPaidUsd: null,
  receivedAmountToken: null,
  payerAddress: null,
  txHash: null,
  paidAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  expiresAt: new Date("2030-01-01"),
}

vi.mock("@walty/db", () => ({
  db: {
    query: {
      paymentRequests: { findFirst: vi.fn(async () => samplePr) },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
          orderBy: () => ({
            limit: async () => [],
            offset: async () => [],
          }),
        }),
      }),
    }),
  },
  addresses: {},
  paymentRequests: {
    id: "id",
    merchantId: "merchantId",
    operatorId: "operatorId",
    status: "status",
    createdAt: "createdAt",
  },
  splitPaymentContributions: {
    id: "id",
    paymentRequestId: "paymentRequestId",
    status: "status",
    createdAt: "createdAt",
  },
}))

let createApp: typeof import("../src/app.js").createApp
let signSessionToken: typeof import("@walty/shared/auth/session-token").signSessionToken

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
  ;({ signSessionToken } = await import("@walty/shared/auth/session-token"))
})

afterAll(() => vi.restoreAllMocks())

function authed() {
  return `token=${signSessionToken({ userId: 1 })}`
}

describe("payment request routes", () => {
  it("GET /payment-requests requires auth", async () => {
    const app = createApp()
    const res = await request(app).get("/payment-requests")
    expect(res.status).toBe(401)
  })

  it("GET /payment-requests returns null when no active request", async () => {
    const app = createApp()
    const res = await request(app)
      .get("/payment-requests")
      .set("Cookie", authed())
    expect(res.status).toBe(200)
    expect(res.body.request).toBe(null)
  })

  it("GET /payment-requests/:id (public) returns public view", async () => {
    const app = createApp()
    const res = await request(app).get("/payment-requests/abc")
    expect(res.status).toBe(200)
    expect(res.body.id).toBe("abc")
    expect(res.body.tokenSymbol).toBe("USDC")
  })

  it("POST /payment-requests validates token", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/payment-requests")
      .set("Cookie", authed())
      .send({ amountUsd: "10", token: "ETH", merchantWalletAddress: "0xabc" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })
})
