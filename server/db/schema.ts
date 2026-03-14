import { pgTable, serial, text, timestamp, pgEnum, integer, unique, uuid, boolean, index } from "drizzle-orm/pg-core"

export const txStatusEnum = pgEnum("tx_status", ["pending", "confirmed", "failed"])
export const businessMemberRoleEnum = pgEnum("business_member_role", ["manager", "cashier", "waiter"])
export const businessMemberStatusEnum = pgEnum("business_member_status", ["invited", "active", "suspended", "revoked"])
export const refundRequestStatusEnum = pgEnum("refund_request_status", ["pending", "approved", "rejected", "executed"])

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  userType: text("user_type").notNull().default("person"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
}, (t) => ({
  uniqUserAddr: unique("addresses_user_id_address_unique").on(t.userId, t.address),
}))

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  hash: text("hash").notNull().unique(),
  chainId: integer("chain_id").notNull().default(1),
  chainType: text("chain_type").notNull().default("EVM"),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  tokenAddress: text("token_address"),
  tokenSymbol: text("token_symbol").notNull(),
  value: text("value").notNull(),
  status: txStatusEnum("status").notNull().default("pending"),
  gasUsed: text("gas_used"),
  blockNumber: text("block_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const walletNonces = pgTable("wallet_nonces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nonce: text("nonce").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
})

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const walletBackups = pgTable("wallet_backups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  salt: text("salt").notNull(),
  version: integer("version").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const paymentRequests = pgTable("payment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chainId: integer("chain_id").notNull().default(137),
  amountUsd: text("amount_usd").notNull(),
  amountToken: text("amount_token").notNull(),
  tokenSymbol: text("token").notNull(),
  tokenAddress: text("token_address").notNull(),
  tokenDecimals: integer("token_decimals").notNull(),
  merchantWalletAddress: text("wallet_address").notNull(),
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash").unique(),
  txBlockNumber: text("tx_block_number"),
  payerAddress: text("payer_address"),
  startBlock: text("start_block").notNull(),
  lastScannedBlock: text("last_scanned_block").notNull(),
  confirmations: integer("confirmations").notNull().default(0),
  requiredConfirmations: integer("required_confirmations").notNull().default(2),
  detectedAt: timestamp("detected_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  isSplitPayment: boolean("is_split_payment").notNull().default(false),
  totalPaidToken: text("total_paid_token").default("0"),
  totalPaidUsd: text("total_paid_usd").default("0"),
  operatorId: integer("operator_id").references(() => users.id, { onDelete: "set null" }),
})

export const businessMembers = pgTable("business_members", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  role: businessMemberRoleEnum("role").notNull(),
  status: businessMemberStatusEnum("status").notNull().default("invited"),
  inviteToken: uuid("invite_token").notNull().unique().defaultRandom(),
  inviteEmail: text("invite_email"),
  invitedBy: integer("invited_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at"),
}, (t) => ({
  businessIdIdx: index("business_members_business_id_idx").on(t.businessId),
  userIdIdx: index("business_members_user_id_idx").on(t.userId),
  inviteTokenIdx: index("business_members_invite_token_idx").on(t.inviteToken),
}))

export const refundRequests = pgTable("refund_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentRequestId: uuid("payment_request_id").notNull().references(() => paymentRequests.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  businessId: integer("business_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amountToken: text("amount_token").notNull(),
  amountUsd: text("amount_usd").notNull(),
  destinationAddress: text("destination_address").notNull(),
  reason: text("reason").notNull(),
  status: refundRequestStatusEnum("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => ({
  businessIdIdx: index("refund_requests_business_id_idx").on(t.businessId),
}))

export const businessAuditLogs = pgTable("business_audit_logs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  metadata: text("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  businessIdIdx: index("business_audit_logs_business_id_idx").on(t.businessId),
}))

export const splitPaymentContributions = pgTable("split_payment_contributions", {
  id: serial("id").primaryKey(),
  paymentRequestId: uuid("payment_request_id").notNull().references(() => paymentRequests.id, { onDelete: "cascade" }),
  txHash: text("tx_hash").notNull().unique(),
  payerAddress: text("payer_address").notNull(),
  amountToken: text("amount_token").notNull(),
  amountUsd: text("amount_usd").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  confirmations: integer("confirmations").notNull().default(0),
  status: text("status").notNull().default("pending"),
  blockNumber: text("block_number"),
  detectedAt: timestamp("detected_at"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
