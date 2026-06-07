"use client";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWalletLifecycle } from "./useWalletLifecycle";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// wallet-store: IndexedDB not available in jsdom
let storedWallet: Record<string, unknown> | null = null;

vi.mock("@/lib/wallet-store", () => ({
  getStoredWallet: vi.fn(async () => storedWallet),
  saveWallet: vi.fn(async (data: Record<string, unknown>) => {
    storedWallet = data;
  }),
  clearStoredWallet: vi.fn(async () => {
    storedWallet = null;
  }),
  getStoredWalletSync: vi.fn(() => null),
}));

// wallet-status: calls fetch /api/addresses + getStoredWallet internally
vi.mock("@/lib/wallet-status", () => ({
  determineWalletStatus: vi.fn(async () => {
    return storedWallet ? "locked" : "new";
  }),
}));

// rpc/getWalletClient: would call RPC providers
vi.mock("@/lib/rpc/getWalletClient", () => ({
  getWalletClient: vi.fn(() => ({
    signMessage: vi.fn(async () => "0xfakesignature"),
    account: { address: "0x0000000000000000000000000000000000000001" },
    chain: { id: 1 },
  })),
}));

// attestDevice: suppress network/security side effects
vi.mock("@/lib/wallet/attestDevice", () => ({
  attestDevice: vi.fn(async () => {}),
}));

// ── Global fetch mock ─────────────────────────────────────────────────────────

const fetchResponses: Record<string, () => Response> = {};

function mockFetchResponse(urlPattern: string, body: unknown, status = 200) {
  fetchResponses[urlPattern] = () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

const calledUrls: string[] = [];

beforeEach(() => {
  storedWallet = null;
  calledUrls.length = 0;

  // /api/wallet/nonce — called during create → linkWallet
  mockFetchResponse("/api/wallet/nonce", {
    data: { nonce: "test-nonce-123" },
  });

  // /api/wallet/link — called during create → linkWallet
  mockFetchResponse("/api/wallet/link", { ok: true });

  // /api/treasury/deploy — best-effort call after linkWallet
  mockFetchResponse("/api/treasury/deploy", { ok: true });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, _?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      calledUrls.push(url);

      for (const pattern of Object.keys(fetchResponses)) {
        if (url.includes(pattern)) {
          return fetchResponses[pattern]();
        }
      }

      // Default: return OK with empty body
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_PIN = "123456";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useWalletLifecycle", () => {
  it("create resolves to unlocked with address", async () => {
    const { result } = renderHook(() => useWalletLifecycle());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(result.current.status).toBe("unlocked");
    expect(result.current.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("deploys the treasury Safe after linking the wallet", async () => {
    const { result } = renderHook(() => useWalletLifecycle());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(calledUrls).toContain("/api/treasury/deploy");
  });

  it("treasury deploy failure does not block wallet creation", async () => {
    // Override treasury deploy to fail
    mockFetchResponse("/api/treasury/deploy", { error: "deploy failed" }, 500);

    const { result } = renderHook(() => useWalletLifecycle());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    // Should not throw even though treasury deploy fails
    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(result.current.status).toBe("unlocked");
    expect(result.current.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("treasury deploy is called with ownerAddress in the body", async () => {
    const fetchSpy = vi.mocked(global.fetch as ReturnType<typeof vi.fn>);

    const { result } = renderHook(() => useWalletLifecycle());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    const treasuryCall = fetchSpy.mock.calls.find(
      ([url]: unknown[]) => typeof url === "string" && url.includes("/api/treasury/deploy"),
    );
    expect(treasuryCall).toBeDefined();

    const init = treasuryCall![1] as RequestInit;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { ownerAddress: string };
    expect(body.ownerAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // The ownerAddress must match what was returned by create
    expect(body.ownerAddress).toBe(result.current.address);
  });
});
