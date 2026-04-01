"use client";

/**
 * useWalletHistory
 *
 * Manages wallet transaction history and balance state.
 * Auto-syncs pending intents and loads history on unlock.
 */

import { useCallback, useEffect, useState } from "react";

export type TxRecord = {
  id: number;
  fromAddress: string;
  toAddress: string;
  value: string;
  hash: string;
  chainId: number;
  chainType: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  status: "pending" | "confirmed" | "failed";
  gasUsed: string | null;
  blockNumber: string | null;
  createdAt: string | null;
};

export interface UseWalletHistoryResult {
  txHistory: TxRecord[];
  loadTxHistory: () => Promise<void>;
  loadBalance: (addr: string) => Promise<void>;
}

export function useWalletHistory(
  address: string | null,
  status: string,
): UseWalletHistoryResult {
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);

  const loadTxHistory = useCallback(async () => {
    const res = await fetch("/api/tx");
    if (res.ok) {
      const { data } = await res.json();
      setTxHistory(data);
    }
  }, []);

  // no-op: balance is covered by usePortfolio
  const loadBalance = useCallback(async (_: string) => {}, []);

  // Auto-sync + load on unlock
  useEffect(() => {
    if (status !== "unlocked") return;
    fetch("/api/tx/sync", { method: "POST" })
      .catch(() => {})
      .then(() => loadTxHistory().catch(() => {}));
  }, [status, loadTxHistory]);

  return {
    txHistory,
    loadTxHistory,
    loadBalance,
  };
}
