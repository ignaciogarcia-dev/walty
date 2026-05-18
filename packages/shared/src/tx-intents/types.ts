export type TxIntentType = "transfer" | "refund" | "gas_funding" | "collection";

/** The payload stored in a tx_intent — everything needed to rebuild the tx. */
export type TxIntentPayload = {
  /** Recipient address for the transfer (for both native and ERC-20). */
  to: string;
  /** Human-readable amount (e.g. "1.5"). */
  amount: string;
  chainId: number;
  token: {
    symbol: string;
    /** ERC-20 token contract address; null for native assets. */
    address: string | null;
    type: "native" | "erc20";
    decimals: number;
  };
  /** Sender address. */
  from: string;
  derivationIndex?: number;
};

export type TxIntentStatus =
  | "pending"
  | "signed"
  | "broadcasting"
  | "broadcasted"
  | "confirmed"
  | "failed"
  | "expired";

export type TxIntent = {
  id: string;
  userId: number;
  type: TxIntentType;
  payload: TxIntentPayload;
  status: TxIntentStatus;
  signedRaw: string | null;
  txHash: string | null;
  createdAt: string;
  expiresAt: string;
};
