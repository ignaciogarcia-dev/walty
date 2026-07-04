export type PaymentRequestStatusFilter =
  | "all"
  | "paid"
  | "expired"
  | "pending"
  | "confirming";

export interface BusinessActivityStats {
  currentMonthSales: {
    total: string;
    count: number;
  };
  previousMonthSales: {
    total: string;
    count: number;
  };
  currentMonthCompleted: number;
  currentMonthFailed: number;
  successRate: number;
  salesChangePercent: number;
}

export interface PaymentRequestHistoryItem {
  id: string;
  status: "pending" | "confirming" | "paid" | "expired";
  amountUsd: string;
  receivedAmountUsd: string | null;
  tokenSymbol: string;
  createdAt: string;
  paidAt: string | null;
  txHash: string | null;
  chainId: number;
  payerAddress: string | null;
}

export interface TransactionActivityItem {
  id: number;
  type: "payment" | "send" | "refund" | "receive" | "collected";
  hash: string;
  chainId: number;
  fromAddress: string;
  toAddress: string;
  value: string;
  tokenSymbol: string;
  status: "pending" | "confirmed" | "failed";
  createdAt: string;
}
