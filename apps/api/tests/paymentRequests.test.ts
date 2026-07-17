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

// Payment-request ids are v4 UUIDs; the public route now rejects non-UUID ids
// (before they reach the DB) so this must be a real UUID shape.
const SAMPLE_PR_ID = "11111111-1111-4111-8111-111111111111"

const samplePr = {
  id: SAMPLE_PR_ID,
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
      deviceSessions: {
        findFirst: vi.fn(async () => ({
          id: "test-sid",
          trustedAt: new Date(),
          lastSeenAt: new Date(),
          revokedAt: null,
        })),
      },
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
  deviceSessions: {},
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
  return `token=${signSessionToken({ userId: 1, sid: "test-sid" })}`
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
    const res = await request(app).get(`/payment-requests/${SAMPLE_PR_ID}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(SAMPLE_PR_ID)
    expect(res.body.tokenSymbol).toBe("USDC")
  })

  it("GET /payment-requests/:id (public) returns 404 for a non-UUID id (no 500)", async () => {
    const app = createApp()
    const res = await request(app).get("/payment-requests/not-a-uuid")
    expect(res.status).toBe(404)
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
