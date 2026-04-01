import { getAddress, parseUnits } from "viem";
import type { Token } from "@/lib/tokens/tokenRegistry";
import type { TxIntentPayload } from "@/lib/tx-intents/types";
import {
  getTxIntent,
  retryFailedTxIntent,
  signTxIntent,
} from "@/lib/tx-intents/client";
import { getWalletClient } from "@/lib/rpc/getWalletClient";
import { getSigner } from "@/lib/signing/signer-registry";
import { buildBaseTx } from "./build";
import { prepareTx } from "./prepare";
import type { WalletSecurityManager } from "@/lib/wallet/WalletSecurityManager";

/**
 * Signs a tx intent end-to-end:
 * 1. Fetch/retry intent from server
 * 2. Derive the correct key (owner or operator via derivationIndex)
 * 3. Build, prepare, and sign the transaction
 * 4. Upload signedRaw to server via signTxIntent
 *
 * @param ownerAddress - The owner's address, used for validation when
 *   derivationIndex is undefined (i.e. the owner is the signer).
 * @param derivationIndex - HD derivation index. undefined/0 = owner key,
 *   positive = operator/cashier key.
 * @returns The reconstructed Token and payload for downstream use (e.g. broadcast).
 */
export async function signIntent(
  intentId: string,
  security: WalletSecurityManager,
  ownerAddress: string,
  derivationIndex?: number,
): Promise<{ token: Token; payload: TxIntentPayload }> {
  let intent = await getTxIntent(intentId);
  if (intent.status === "failed") {
    intent = await retryFailedTxIntent(intentId);
  }

  const { payload } = intent;
  const {
    to,
    amount,
    chainId,
    token: intentToken,
    from: fromPayload,
  } = payload;
  const from = getAddress(fromPayload);

  const effectiveIndex = derivationIndex ?? 0;

  // When signing as owner (no derivationIndex), verify that the unlocked
  // wallet matches the intent's `from` address.
  if (derivationIndex == null && getAddress(ownerAddress) !== from) {
    throw new Error(
      "The unlocked wallet does not match the account that must sign this transaction",
    );
  }

  const token: Token = {
    symbol: intentToken.symbol,
    address: intentToken.address as `0x${string}` | null,
    type: intentToken.type,
    decimals: intentToken.decimals,
    name: intentToken.symbol,
    chainId,
    coingeckoId: "",
  };

  const signedRaw = await security.withUnlockedSeed(async (mnemonic) => {
    const walletClient = getWalletClient(mnemonic, chainId, effectiveIndex);
    const signer = getSigner(walletClient);

    const { mnemonicToAccount } = await import("viem/accounts");
    const derived = mnemonicToAccount(mnemonic, {
      addressIndex: effectiveIndex,
    });

    if (getAddress(derived.address) !== from) {
      throw new Error(
        derivationIndex != null
          ? "Derived operator address does not match intent from address"
          : "The unlocked wallet does not match the account that must sign this transaction",
      );
    }

    const base = buildBaseTx({ token, to, amount, chainId });
    const unsigned = await prepareTx(
      base,
      from,
      token.type === "erc20" && token.address
        ? {
            address: token.address as `0x${string}`,
            decimals: token.decimals,
            amount: parseUnits(amount, token.decimals),
          }
        : undefined,
    );
    const signed = await signer.signTransaction(unsigned);
    return signed.raw;
  });

  await signTxIntent(intentId, signedRaw);
  return { token, payload };
}
