export type ActivityFilter = "all" | "payments" | "sends"
export type PaymentRequestStatusFilter = "all" | "paid" | "expired" | "pending" | "confirming"

export interface PersonActivityStats {
  currentMonthExpenses: {
    total: string
    count: number
  }
  previousMonthExpenses: {
    total: string
    count: number
  }
  currentMonthSends: {
    total: string
    count: number
  }
  previousMonthSends: {
    total: string
    count: number
  }
  expensesChangePercent: number
  sendsChangePercent: number
}

export interface BusinessActivityStats {
  currentMonthSales: {
    total: string
    count: number
  }
  previousMonthSales: {
    total: string
    count: number
  }
  currentMonthCompleted: number
  currentMonthFailed: number
  successRate: number
  salesChangePercent: number
}

export interface ActivityStats {
  person?: PersonActivityStats
  business?: BusinessActivityStats
}

export interface PaymentRequestHistoryItem {
  id: string
  status: "pending" | "confirming" | "paid" | "expired"
  amountUsd: string
  tokenSymbol: string
  createdAt: string
  paidAt: string | null
  txHash: string | null
  chainId: number
}

export interface TransactionActivityItem {
  id: number
  type: "payment" | "send"
  hash: string
  chainId: number
  fromAddress: string
  toAddress: string
  value: string
  tokenSymbol: string
  status: "pending" | "confirmed" | "failed"
  createdAt: string
}
