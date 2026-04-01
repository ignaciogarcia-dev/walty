"use client";

/**
 * useOperatorWalletCollection
 *
 * Two-step collection flow for operator wallets:
 * 1. If operator MATIC < threshold, fund gas from owner wallet
 * 2. Transfer USDC/USDT from operator wallet to owner (using operator's derived key)
 *
 * Uses separate collectStatus state to avoid conflicts with SendForm/refund txStatus.
 */

import { useCallback, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import type { Token } from "@/lib/tokens/tokenRegistry";
import { getPublicClient } from "@/lib/rpc/getPublicClient";
import { signIntent } from "@/lib/transactions/signIntent";
import {
  createTxIntent,
  broadcastTxIntent,
  confirmTxIntent,
} from "@/lib/tx-intents/client";
import type { WalletSecurityManager } from "@/lib/wallet/WalletSecurityManager";
import { PAYMENT_CHAIN_ID_POLYGON } from "@/lib/wallet/OperatorWalletManager";

export type CollectStatus =
  | "idle"
  | "funding-gas"
  | "collecting"
  | "confirmed"
  | "error";

export interface UseOperatorWalletCollectionResult {
  collectStatus: CollectStatus;
  collectTxHash: string | null;
  collectError: string | null;
  collectOperatorFunds: (payload: {
    derivationIndex: number;
    operatorAddress: string;
    token: Token;
  }) => Promise<void>;
  resetCollect: () => void;
  deriveOperatorAddress: (derivationIndex: number) => Promise<string>;
}

const MIN_MATIC_FOR_GAS = parseUnits("0.02", 18);
const GAS_FUNDING_AMOUNT = "0.05";

export function useOperatorWalletCollection(
  address: string | null,
  security: WalletSecurityManager,
  loadBalance: (addr: string) => Promise<void>,
): UseOperatorWalletCollectionResult {
  const [collectStatus, setCollectStatus] = useState<CollectStatus>("idle");
  const [collectTxHash, setCollectTxHash] = useState<string | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);

  const resetCollect = useCallback(() => {
    setCollectStatus("idle");
    setCollectTxHash(null);
    setCollectError(null);
  }, []);

  // ── deriveOperatorAddress ──────────────────────────────────────────────
  const deriveOperatorAddress = useCallback(
    async (derivationIndex: number): Promise<string> => {
      if (derivationIndex < 1)
        throw new Error("Derivation index must be >= 1");
      return security.withUnlockedSeed(async (mnemonic) => {
        const { mnemonicToAccount } = await import("viem/accounts");
        const account = mnemonicToAccount(mnemonic, {
          addressIndex: derivationIndex,
        });
        return account.address;
      });
    },
    [security],
  );

  // ── collectOperatorFunds ───────────────────────────────────────────────
  const collectOperatorFunds = useCallback(
    async ({
      derivationIndex,
      operatorAddress,
      token,
    }: {
      derivationIndex: number;
      operatorAddress: string;
      token: Token;
    }): Promise<void> => {
      if (!security.isPinAvailable() || !address) {
        setCollectError("Wallet locked");
        setCollectStatus("error");
        return;
      }

      setCollectStatus("idle");
      setCollectTxHash(null);
      setCollectError(null);

      const { getOperatorSingleTokenBalance } = await import(
        "@/lib/business/operatorBalance"
      );

      try {
        // ── Step 1: Gas check ──────────────────────────────────────────
        const publicClient = getPublicClient(PAYMENT_CHAIN_ID_POLYGON);
        const maticBalance = await publicClient.getBalance({
          address: operatorAddress as `0x${string}`,
        });

        if (maticBalance < MIN_MATIC_FOR_GAS) {
          setCollectStatus("funding-gas");

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
              to: operatorAddress,
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

        // ── Step 2: Collect USDC/USDT from operator → owner ──────────
        setCollectStatus("collecting");

        const tokenBalance = await getOperatorSingleTokenBalance(
          operatorAddress,
          token.symbol,
        );
        if (tokenBalance === 0n) {
          throw new Error("No balance to collect");
        }

        const collectAmount = formatUnits(tokenBalance, token.decimals);

        const collectIntent = await createTxIntent(
          {
            to: address,
            amount: collectAmount,
            chainId: PAYMENT_CHAIN_ID_POLYGON,
            token: {
              symbol: token.symbol,
              address: token.address,
              type: token.type,
              decimals: token.decimals,
            },
            from: operatorAddress,
          },
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
          "collection",
        );

        await signIntent(
          collectIntent.id,
          security,
          address,
          derivationIndex,
        );

        const collectBroadcasted = await broadcastTxIntent(collectIntent.id);
        const collectHash = collectBroadcasted.txHash!;
        setCollectTxHash(collectHash);

        const collectReceipt = await Promise.race([
          publicClient.waitForTransactionReceipt({
            hash: collectHash as `0x${string}`,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Collection timeout")),
              60_000,
            ),
          ),
        ]);

        if (collectReceipt.status === "success") {
          setCollectStatus("confirmed");
          confirmTxIntent(collectIntent.id, "confirmed").catch(() => {});
          if (address) loadBalance(address);
        } else {
          confirmTxIntent(collectIntent.id, "failed").catch(() => {});
          throw new Error("Collection transaction failed on-chain");
        }
      } catch (err) {
        setCollectStatus("error");
        setCollectError(
          err instanceof Error ? err.message : "Error desconocido",
        );
      }
    },
    [
      address,
      security,
      loadBalance,
    ],
  );

  return {
    collectStatus,
    collectTxHash,
    collectError,
    collectOperatorFunds,
    resetCollect,
    deriveOperatorAddress,
  };
}
