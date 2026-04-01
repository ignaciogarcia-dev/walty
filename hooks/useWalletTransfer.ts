"use client";

/**
 * useWalletTransfer
 *
 * Manages transfer orchestration: intent creation, signing, broadcasting,
 * tx recording, and status state. Includes signAndBroadcastIntent for
 * refund/operator flows with gas funding.
 */

import { useCallback, useRef, useState } from "react";
import { parseUnits } from "viem";
import type { Token } from "@/lib/tokens/tokenRegistry";
import { signIntent } from "@/lib/transactions/signIntent";
import {
  createTxIntent,
  broadcastTxIntent,
  confirmTxIntent,
  getTxIntent,
} from "@/lib/tx-intents/client";
import { getPublicClient } from "@/lib/rpc/getPublicClient";
import { getTxUrl } from "@/lib/explorer/getTxUrl";
import { toast } from "@/hooks/useToast";
import type { WalletSecurityManager } from "@/lib/wallet/WalletSecurityManager";
import { PAYMENT_CHAIN_ID_POLYGON } from "@/lib/wallet/OperatorWalletManager";

export type TxStatus =
  | "idle"
  | "pending"
  | "confirmed"
  | "error"
  | "pending_on_chain";

const MIN_MATIC_FOR_GAS = parseUnits("0.02", 18);
const GAS_FUNDING_AMOUNT = "0.05";

export interface UseWalletTransferResult {
  txStatus: TxStatus;
  txHash: string | null;
  txError: string | null;
  executeTransfer: (
    token: Token,
    to: string,
    amount: string,
    chainId?: number,
  ) => Promise<void>;
  signAndBroadcastIntent: (intentId: string) => Promise<void>;
  resetTx: () => void;
}

export function useWalletTransfer(
  address: string | null,
  security: WalletSecurityManager,
  loadTxHistory: () => Promise<void>,
  loadBalance: (addr: string) => Promise<void>,
): UseWalletTransferResult {
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const sendLockRef = useRef(false);
  const txIntentKeyRef = useRef<string | null>(null);

  const resetTx = useCallback(() => {
    setTxStatus("idle");
    setTxHash(null);
    setTxError(null);
  }, []);

  // ── Record tx to server ────────────────────────────────────────────────
  const recordTx = useCallback(
    async (
      hash: string,
      to: string,
      value: string,
      chainId: number,
      token: Token,
      intentId: string,
    ) => {
      if (!address) return;
      await fetch("/api/tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hash,
          chainId,
          chainType: "EVM",
          tokenAddress: token.address ?? null,
          tokenSymbol: token.symbol,
          intentId,
          from: address,
          to,
          value,
        }),
      });
    },
    [address],
  );

  const updateTxRecord = useCallback(async (hash: string) => {
    await fetch("/api/tx", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash }),
    });
  }, []);

  // ── Broadcast intent (internal) ────────────────────────────────────────
  const broadcastIntentInternal = useCallback(
    async (
      intentId: string,
      token: Token,
      payload: { to: string; amount: string; chainId: number },
    ) => {
      const broadcasted = await broadcastTxIntent(intentId);
      const hash = broadcasted.txHash!;

      setTxHash(hash);
      await recordTx(
        hash,
        payload.to,
        payload.amount,
        payload.chainId,
        token,
        intentId,
      ).catch(() => {});

      const publicClient = getPublicClient(payload.chainId);
      let receipt;
      try {
        receipt = await Promise.race([
          publicClient.waitForTransactionReceipt({
            hash: hash as `0x${string}`,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 60_000),
          ),
        ]);
      } catch (err) {
        if (err instanceof Error && err.message === "timeout") {
          setTxStatus("pending_on_chain");
          loadTxHistory().catch(() => {});
          return;
        }
        throw err;
      }

      if (receipt.status === "success") {
        setTxStatus("confirmed");
        txIntentKeyRef.current = null;
        await updateTxRecord(hash).catch(() => {});
        confirmTxIntent(intentId, "confirmed").catch(() => {});
        if (address) loadBalance(address);
        toast.success("Transaction confirmed", {
          description: `${payload.amount} ${token.symbol} sent`,
          href: getTxUrl(hash, payload.chainId),
        });
      } else {
        setTxStatus("error");
        txIntentKeyRef.current = null;
        setTxError("Transaction failed on-chain");
        await updateTxRecord(hash).catch(() => {});
        confirmTxIntent(intentId, "failed").catch(() => {});
        toast.error("Transaction failed", {
          description: "The transaction was rejected by the network.",
        });
      }
      loadTxHistory().catch(() => {});
    },
    [address, recordTx, updateTxRecord, loadTxHistory, loadBalance],
  );

  // ── signAndBroadcastIntent ─────────────────────────────────────────────
  const signAndBroadcastIntent = useCallback(
    async (intentId: string) => {
      if (!security.isPinAvailable() || !address) {
        setTxStatus("error");
        setTxError("Wallet locked");
        return;
      }

      if (sendLockRef.current) {
        setTxStatus("error");
        setTxError("A transaction is already in progress");
        return;
      }
      sendLockRef.current = true;

      try {
        setTxStatus("pending");
        setTxHash(null);
        setTxError(null);

        const intent = await getTxIntent(intentId);
        const derivationIndex = intent.payload.derivationIndex;
        const fromAddress = intent.payload.from;

        // Gas funding for operator wallets on Polygon
        if (
          derivationIndex != null &&
          intent.payload.chainId === PAYMENT_CHAIN_ID_POLYGON
        ) {
          const publicClient = getPublicClient(PAYMENT_CHAIN_ID_POLYGON);
          const maticBalance = await publicClient.getBalance({
            address: fromAddress as `0x${string}`,
          });

          if (maticBalance < MIN_MATIC_FOR_GAS) {
            const maticToken: Token = {
              symbol: "MATIC",
              type: "native",
              address: null,
              name: "Polygon",
              decimals: 18,
              chainId: PAYMENT_CHAIN_ID_POLYGON,
              coingeckoId: "matic-network",
            };

            const gasIntent = await createTxIntent(
              {
                to: fromAddress,
                amount: GAS_FUNDING_AMOUNT,
                chainId: PAYMENT_CHAIN_ID_POLYGON,
                token: {
                  symbol: maticToken.symbol,
                  address: maticToken.address,
                  type: maticToken.type,
                  decimals: maticToken.decimals,
                },
                from: address,
              },
              typeof crypto !== "undefined" &&
                typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
              "gas_funding",
            );

            await signIntent(gasIntent.id, security, address);
            const gasBroadcasted = await broadcastTxIntent(gasIntent.id);
            const gasHash = gasBroadcasted.txHash!;

            const gasReceipt = await Promise.race([
              publicClient.waitForTransactionReceipt({
                hash: gasHash as `0x${string}`,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Gas funding timeout")),
                  60_000,
                ),
              ),
            ]);

            if (gasReceipt.status !== "success") {
              throw new Error("Gas funding transaction failed on-chain");
            }
            confirmTxIntent(gasIntent.id, "confirmed").catch(() => {});
          }
        }

        const { token, payload } = await signIntent(
          intentId,
          security,
          address,
          derivationIndex,
        );
        await broadcastIntentInternal(intentId, token, payload);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setTxStatus("error");
        txIntentKeyRef.current = null;
        setTxError(msg);
        toast.error("Failed to send", { description: msg });
      } finally {
        sendLockRef.current = false;
      }
    },
    [address, security, broadcastIntentInternal],
  );

  // ── executeTransfer ────────────────────────────────────────────────────
  const executeTransfer = useCallback(
    async (
      token: Token,
      to: string,
      amount: string,
      chainId: number = 1,
    ) => {
      if (!security.isPinAvailable() || !address) {
        setTxStatus("error");
        setTxError("Wallet locked");
        return;
      }

      if (sendLockRef.current) {
        setTxStatus("error");
        setTxError("A transaction is already in progress");
        return;
      }

      if (!txIntentKeyRef.current) {
        txIntentKeyRef.current =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      }

      setTxStatus("pending");
      setTxHash(null);
      setTxError(null);
      sendLockRef.current = true;

      try {
        const intent = await createTxIntent(
          {
            to,
            amount,
            chainId,
            token: {
              symbol: token.symbol,
              address: token.address,
              type: token.type,
              decimals: token.decimals,
            },
            from: address,
          },
          txIntentKeyRef.current,
          "transfer",
        );

        const { token: resolvedToken, payload } = await signIntent(
          intent.id,
          security,
          address,
        );
        await broadcastIntentInternal(intent.id, resolvedToken, payload);
      } catch (err: unknown) {
        setTxStatus("error");
        txIntentKeyRef.current = null;
        setTxError(
          err instanceof Error ? err.message : "Unknown error",
        );
      } finally {
        sendLockRef.current = false;
      }
    },
    [address, security, broadcastIntentInternal],
  );

  return {
    txStatus,
    txHash,
    txError,
    executeTransfer,
    signAndBroadcastIntent,
    resetTx,
  };
}
