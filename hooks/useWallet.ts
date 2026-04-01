"use client";

/**
 * useWallet — Coordinator hook
 *
 * Composes all wallet sub-hooks into a single unified interface.
 * Zero behavioral changes from original — purely structural refactor.
 *
 * Sub-hooks:
 * - useWalletLifecycle: create, unlock, lock, recover, backup, export, import
 * - useWalletTransfer: send, sign, broadcast, gas estimation
 * - useOperatorWalletCollection: gas funding, collection, operator derivation
 * - useWalletHistory: tx history, balance
 */

import { useWalletLifecycle } from "./useWalletLifecycle";
import type { WalletStatus } from "./useWalletLifecycle";
import { useWalletTransfer } from "./useWalletTransfer";
import type { TxStatus } from "./useWalletTransfer";
import { useOperatorWalletCollection } from "./useOperatorWalletCollection";
import type { CollectStatus } from "./useOperatorWalletCollection";
import { useWalletHistory } from "./useWalletHistory";
import type { TxRecord } from "./useWalletHistory";
import { useRelayTransfer } from "./useRelayTransfer";

export type { WalletStatus, TxStatus, TxRecord, CollectStatus };

export function useWallet() {
  const lifecycle = useWalletLifecycle();
  const history = useWalletHistory(lifecycle.address, lifecycle.status);
  const transfer = useWalletTransfer(
    lifecycle.address,
    lifecycle.security,
    history.loadTxHistory,
    history.loadBalance,
  );
  const relay = useRelayTransfer(
    lifecycle.address,
    lifecycle.security,
    history.loadTxHistory,
    history.loadBalance,
  );
  const collection = useOperatorWalletCollection(
    lifecycle.address,
    lifecycle.security,
    history.loadBalance,
  );

  return {
    // Lifecycle
    status: lifecycle.status,
    address: lifecycle.address,
    create: lifecycle.create,
    unlock: lifecycle.unlock,
    lock: lifecycle.lock,
    refreshStatus: lifecycle.refreshStatus,
    isRecentlyUnlocked: lifecycle.isRecentlyUnlocked,
    exportWallet: lifecycle.exportWallet,
    importWallet: lifecycle.importWallet,
    createBackup: lifecycle.createBackup,
    recoverWallet: lifecycle.recoverWallet,

    // Transfer — used by signAndBroadcastIntent (refund flow)
    txStatus: transfer.txStatus,
    txHash: transfer.txHash,
    txError: transfer.txError,
    executeTransfer: transfer.executeTransfer,
    signAndBroadcastIntent: transfer.signAndBroadcastIntent,
    resetTx: transfer.resetTx,

    // Relay transfer — gasless, 1% fee (send/pay flows)
    relayTxStatus: relay.txStatus,
    relayTxHash: relay.txHash,
    relayTxError: relay.txError,
    executeRelayTransfer: relay.executeRelayTransfer,
    resetRelayTx: relay.resetTx,

    // History
    txHistory: history.txHistory,

    // Operator collection
    deriveOperatorAddress: collection.deriveOperatorAddress,
    collectOperatorFunds: collection.collectOperatorFunds,
    collectStatus: collection.collectStatus,
    collectTxHash: collection.collectTxHash,
    collectError: collection.collectError,
    resetCollect: collection.resetCollect,
  };
}
