import type { PersonActivityStats, BusinessActivityStats, TransactionActivityItem } from "./types"

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount
  if (isNaN(num)) return "$0.00"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function calculateChangePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export function formatChangePercent(percent: number): string {
  const sign = percent >= 0 ? "+" : ""
  return `${sign}${percent.toFixed(1)}%`
}

export function getMonthRange(monthOffset: number = 0): { start: Date; end: Date } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() - monthOffset
  
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  
  return { start, end }
}

export function isTransactionPayment(tx: TransactionActivityItem, userAddress: string): boolean {
  // A payment is when the user sends money (fromAddress = userAddress)
  // and the transaction is confirmed
  return tx.fromAddress.toLowerCase() === userAddress.toLowerCase() && tx.status === "confirmed"
}

export function isTransactionSend(tx: TransactionActivityItem, userAddress: string): boolean {
  // A send is any transaction where fromAddress = userAddress
  return tx.fromAddress.toLowerCase() === userAddress.toLowerCase()
}

export function sumAmounts(amounts: string[]): string {
  return amounts.reduce((sum, amount) => {
    const num = parseFloat(amount)
    return (parseFloat(sum) + (isNaN(num) ? 0 : num)).toString()
  }, "0")
}
