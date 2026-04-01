"use client";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWallet } from "./useWallet";
import type { TxIntent, TxIntentPayload } from "@/lib/tx-intents/types";

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
    signTransaction: vi.fn(async () => "0xfakerawtx"),
    account: { address: "0x0000000000000000000000000000000000000001" },
    chain: { id: 1 },
  })),
}));

// rpc/getPublicClient: would call blockchain RPC
const mockGetBalance = vi.fn(async () => 1000000000000000000n); // 1 ETH
const mockWaitForTransactionReceipt = vi.fn(
  async (): Promise<{ status: "success" | "reverted" }> => ({
    status: "success",
  }),
);
const mockGetTransactionCount = vi.fn(async () => 0);
const mockEstimateGas = vi.fn(async () => 21000n);
const mockEstimateFeesPerGas = vi.fn(async () => ({
  maxFeePerGas: 20000000000n,
  maxPriorityFeePerGas: 1000000000n,
}));

vi.mock("@/lib/rpc/getPublicClient", () => ({
  getPublicClient: vi.fn(() => ({
    getBalance: mockGetBalance,
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
    getTransactionCount: mockGetTransactionCount,
    estimateGas: mockEstimateGas,
    estimateFeesPerGas: mockEstimateFeesPerGas,
  })),
}));

// signing/signer-registry: intercept signTransaction
vi.mock("@/lib/signing/signer-registry", () => ({
  getSigner: vi.fn(() => ({
    type: "web" as const,
    signTransaction: vi.fn(async () => ({ raw: "0xsignedrawtx" })),
  })),
}));

// tx-intents/client: all intent API calls
const FAKE_INTENT_ID = "intent-123";
let lastCreatedIntent: TxIntent | null = null;

function makeFakeIntent(
  payload: TxIntentPayload,
  overrides: Partial<TxIntent> = {},
): TxIntent {
  return {
    id: FAKE_INTENT_ID,
    userId: 1,
    type: "transfer",
    payload,
    status: "pending",
    signedRaw: null,
    txHash: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    ...overrides,
  };
}

vi.mock("@/lib/tx-intents/client", () => ({
  createTxIntent: vi.fn(async (payload: TxIntentPayload) => {
    lastCreatedIntent = makeFakeIntent(payload);
    return lastCreatedIntent;
  }),
  getTxIntent: vi.fn(async () => {
    if (!lastCreatedIntent) throw new Error("No intent created");
    return lastCreatedIntent;
  }),
  signTxIntent: vi.fn(async (_intentId: string) => {
    if (lastCreatedIntent) lastCreatedIntent.status = "signed";
    return lastCreatedIntent;
  }),
  broadcastTxIntent: vi.fn(async () => {
    if (lastCreatedIntent) {
      lastCreatedIntent.status = "broadcasted";
      lastCreatedIntent.txHash = "0xfaketxhash";
    }
    return lastCreatedIntent;
  }),
  confirmTxIntent: vi.fn(async () => lastCreatedIntent),
  retryFailedTxIntent: vi.fn(async () => lastCreatedIntent),
}));

// transactions/prepare: would call RPC for nonce, gas, fees
vi.mock("@/lib/transactions/prepare", () => ({
  prepareTx: vi.fn(async (base: Record<string, unknown>) => ({
    ...base,
    nonce: 0,
    gas: 21000n,
    maxFeePerGas: 20000000000n,
    maxPriorityFeePerGas: 1000000000n,
  })),
}));

// explorer/getTxUrl
vi.mock("@/lib/explorer/getTxUrl", () => ({
  getTxUrl: vi.fn(() => "https://etherscan.io/tx/0xfaketxhash"),
}));

// toast: suppress UI side effects
vi.mock("@/hooks/useToast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Global fetch mock ─────────────────────────────────────────────────────────

const fetchResponses: Record<string, () => Response> = {};

function mockFetchResponse(
  urlPattern: string,
  body: unknown,
  status = 200,
) {
  fetchResponses[urlPattern] = () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

beforeEach(() => {
  storedWallet = null;
  lastCreatedIntent = null;

  // /api/wallet/nonce — called during create → linkWallet
  mockFetchResponse("/api/wallet/nonce", {
    data: { nonce: "test-nonce-123" },
  });

  // /api/wallet/link — called during create → linkWallet
  mockFetchResponse("/api/wallet/link", { ok: true });

  // /api/wallet/backup — called during createBackup
  mockFetchResponse("/api/wallet/backup", { ok: true });

  // /api/wallet/challenge — called during create (server challenge for v3)
  mockFetchResponse("/api/wallet/challenge", {
    data: { challenge: "test-challenge" },
  });

  // /api/tx — POST (recordTx) and GET (loadTxHistory)
  mockFetchResponse("/api/tx", { data: [] });

  // /api/tx/sync — POST (sync pending intents)
  mockFetchResponse("/api/tx/sync", { ok: true });

  // /api/addresses — called by determineWalletStatus (mocked, but just in case)
  mockFetchResponse("/api/addresses", {
    data: { addresses: [] },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, _?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

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

const ETH_TOKEN = {
  symbol: "ETH",
  type: "native" as const,
  address: null,
  name: "Ethereum",
  decimals: 18,
  chainId: 1,
  coingeckoId: "ethereum",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useWallet integration", () => {
  it("starts in loading → resolves to new (no stored wallet)", async () => {
    const { result } = renderHook(() => useWallet());

    // Initial render: loading
    expect(result.current.status).toBe("loading");

    // After determineWalletStatus resolves
    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });
  });

  it("create → unlocked with address", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(result.current.status).toBe("unlocked");
    expect(result.current.address).toBeTruthy();
    expect(result.current.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Wallet was persisted to store
    expect(storedWallet).not.toBeNull();
    expect(storedWallet!.address).toBe(result.current.address);
  });

  it("create → lock → locked with null address", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(result.current.status).toBe("unlocked");
    const addr = result.current.address;

    act(() => {
      result.current.lock();
    });

    expect(result.current.status).toBe("locked");
    expect(result.current.address).toBeNull();

    // Wallet still persisted (lock doesn't delete)
    expect(storedWallet).not.toBeNull();
    expect(storedWallet!.address).toBe(addr);
  });

  it("create → lock → unlock with correct PIN", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    const addr = result.current.address;

    act(() => {
      result.current.lock();
    });

    expect(result.current.status).toBe("locked");

    await act(async () => {
      await result.current.unlock(TEST_PIN);
    });

    expect(result.current.status).toBe("unlocked");
    expect(result.current.address).toBe(addr);
  });

  it("unlock with wrong PIN throws", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    // Create and lock
    await act(async () => {
      await result.current.create(TEST_PIN);
    });
    act(() => {
      result.current.lock();
    });

    // Wrong PIN should throw (real crypto decryption failure)
    await expect(
      act(async () => {
        await result.current.unlock("999999");
      }),
    ).rejects.toThrow();

    expect(result.current.status).toBe("locked");
  });

  it("create → executeTransfer → confirmed", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(result.current.txStatus).toBe("idle");

    await act(async () => {
      await result.current.executeTransfer(
        ETH_TOKEN,
        "0x0000000000000000000000000000000000000002",
        "0.1",
        1,
      );
    });

    expect(result.current.txStatus).toBe("confirmed");
    expect(result.current.txHash).toBe("0xfaketxhash");
  });

  it("executeTransfer while locked sets error", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    act(() => {
      result.current.lock();
    });

    await act(async () => {
      await result.current.executeTransfer(
        ETH_TOKEN,
        "0x0000000000000000000000000000000000000002",
        "0.1",
        1,
      );
    });

    expect(result.current.txStatus).toBe("error");
    expect(result.current.txError).toBe("Wallet locked");
  });

  it("resetTx clears transfer state", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    await act(async () => {
      await result.current.executeTransfer(
        ETH_TOKEN,
        "0x0000000000000000000000000000000000000002",
        "0.1",
        1,
      );
    });

    expect(result.current.txStatus).toBe("confirmed");

    act(() => {
      result.current.resetTx();
    });

    expect(result.current.txStatus).toBe("idle");
    expect(result.current.txHash).toBeNull();
    expect(result.current.txError).toBeNull();
  });

  it("full lifecycle: create → transfer → lock → unlock → transfer", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    // Create
    await act(async () => {
      await result.current.create(TEST_PIN);
    });
    expect(result.current.status).toBe("unlocked");
    const addr = result.current.address;

    // Transfer 1
    await act(async () => {
      await result.current.executeTransfer(
        ETH_TOKEN,
        "0x0000000000000000000000000000000000000002",
        "0.5",
        1,
      );
    });
    expect(result.current.txStatus).toBe("confirmed");

    // Reset + Lock
    act(() => {
      result.current.resetTx();
      result.current.lock();
    });
    expect(result.current.status).toBe("locked");

    // Unlock
    await act(async () => {
      await result.current.unlock(TEST_PIN);
    });
    expect(result.current.status).toBe("unlocked");
    expect(result.current.address).toBe(addr);

    // Reset intent state for second transfer
    lastCreatedIntent = null;

    // Transfer 2
    await act(async () => {
      await result.current.executeTransfer(
        ETH_TOKEN,
        "0x0000000000000000000000000000000000000003",
        "0.2",
        1,
      );
    });
    expect(result.current.txStatus).toBe("confirmed");
  });

  it("isRecentlyUnlocked returns true right after unlock", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(result.current.isRecentlyUnlocked()).toBe(true);
  });

  it("auto-lock fires after inactivity timeout", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useWallet());

    // Wait for initial status
    await act(async () => {
      // Flush determineWalletStatus microtask
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    expect(result.current.status).toBe("unlocked");

    // Advance past the 2-minute lock timeout
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000 + 100);
    });

    expect(result.current.status).toBe("locked");
    expect(result.current.address).toBeNull();

    vi.useRealTimers();
  });

  it("broadcast failure sets txStatus to error", async () => {
    // Override receipt to return failure
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "reverted" as const,
    });

    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await act(async () => {
      await result.current.create(TEST_PIN);
    });

    await act(async () => {
      await result.current.executeTransfer(
        ETH_TOKEN,
        "0x0000000000000000000000000000000000000002",
        "0.1",
        1,
      );
    });

    expect(result.current.txStatus).toBe("error");
    expect(result.current.txError).toBe("Transaction failed on-chain");
  });

  it("PIN validation rejects short PINs on create", async () => {
    const { result } = renderHook(() => useWallet());

    await vi.waitFor(() => {
      expect(result.current.status).toBe("new");
    });

    await expect(
      act(async () => {
        await result.current.create("123"); // Too short
      }),
    ).rejects.toThrow();

    // Status unchanged
    expect(result.current.status).toBe("new");
  });
});
