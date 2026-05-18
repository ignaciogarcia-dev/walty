export type BusinessRole = "owner" | "cashier"

export type BusinessContext = {
  businessId: number
  role: BusinessRole
  isOwner: boolean
  memberId?: number
  walletAddress?: string | null
}
