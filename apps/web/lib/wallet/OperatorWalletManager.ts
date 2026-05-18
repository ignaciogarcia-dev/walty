/**
 * OperatorWalletManager
 *
 * Pure service for operator HD wallet operations:
 * - Deriving operator child addresses from mnemonic using derivationIndex
 * - Gas funding calculations for operator wallets
 *
 * No I/O, no state mutations, no React.
 */

import { parseUnits } from "viem";
import { mnemonicToAccount } from "viem/accounts";

export interface OperatorGasConfig {
  minMaticForGas: bigint;
  gasFundingAmount: string;
}

export const DEFAULT_OPERATOR_GAS_CONFIG: OperatorGasConfig = {
  minMaticForGas: parseUnits("0.02", 18),
  gasFundingAmount: "0.05",
};

export const PAYMENT_CHAIN_ID_POLYGON = 137;

export class OperatorWalletManager {
  private gasConfig: OperatorGasConfig;

  constructor(gasConfig: OperatorGasConfig = DEFAULT_OPERATOR_GAS_CONFIG) {
    this.gasConfig = gasConfig;
  }

  /**
   * Derive the operator's child address using the derivation index.
   *
   * @param mnemonic - The owner's BIP39 mnemonic
   * @param derivationIndex - The path index (0 = owner, 1+ = operators)
   */
  deriveOperatorAddress(mnemonic: string, derivationIndex: number): string {
    const account = mnemonicToAccount(mnemonic, {
      addressIndex: derivationIndex,
    });
    return account.address;
  }

  /**
   * Validate that a derived address matches the expected address.
   */
  validateDerivedAddress(
    mnemonic: string,
    derivationIndex: number,
    expectedAddress: string,
  ): boolean {
    try {
      const derived = this.deriveOperatorAddress(mnemonic, derivationIndex);
      return derived.toLowerCase() === expectedAddress.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * If current balance is below minMaticForGas, return the gasFundingAmount.
   * Otherwise return null (no funding needed).
   */
  calculateGasFunding(currentBalance: bigint): string | null {
    if (currentBalance < this.gasConfig.minMaticForGas) {
      return this.gasConfig.gasFundingAmount;
    }
    return null;
  }

  hasSufficientGas(balance: bigint): boolean {
    return balance >= this.gasConfig.minMaticForGas;
  }

  getGasConfig(): OperatorGasConfig {
    return this.gasConfig;
  }
}

export function createOperatorWalletManager(
  gasConfig?: OperatorGasConfig,
): OperatorWalletManager {
  return new OperatorWalletManager(gasConfig);
}
