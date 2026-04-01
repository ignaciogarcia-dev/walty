import { pgTable, serial, text, timestamp, pgEnum, integer, unique, uuid, boolean, index, jsonb, bigint } from "drizzle-orm/pg-core"

export const txStatusEnum = pgEnum("tx_status", ["pending", "confirmed", "failed"])
export const txIntentStatusEnum = pgEnum("tx_intent_status", ["pending", "signed", "broadcasting", "broadcasted", "confirmed", "failed", "expired"])
export const businessMemberRoleEnum = pgEnum("business_member_role", ["cashier"])
export const businessMemberStatusEnum = pgEnum("business_member_status", ["invited", "active", "suspended", "revoked"])
export const txIntentTypeEnum = pgEnum("tx_intent_type", ["transfer", "refund", "gas_funding", "collection"])
export const refundRequestStatusEnum = pgEnum("refund_request_status", ["pending", "approved", "approved_pending_signature", "rejected", "executed"])

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  userType: text("user_type"),
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
  hash: text("hash").notNull(),
  logIndex: integer("log_index").notNull().default(-1),
  type: text("type"),
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
  intentId: uuid("intent_id").references(() => txIntents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  intentIdIdx: index("transactions_intent_id_idx").on(t.intentId),
  hashLogIdxUniq: unique("transactions_hash_logidx_unique").on(t.hash, t.logIndex),
}))

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
  chainId: integer("chain_id").notNull().default(137),
  createdAt: timestamp("created_at").defaultNow(),
})

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull().default(""),
  username: text("username").unique(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const walletBackups = pgTable("wallet_backups", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
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
  receivedAmountToken: text("received_amount_token"),
  receivedAmountUsd: text("received_amount_usd"),
  paymentDiscrepancy: text("payment_discrepancy"),
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
  derivationIndex: integer("derivation_index"),
  walletAddress: text("wallet_address"),
}, (t) => ({
  businessIdIdx: index("business_members_business_id_idx").on(t.businessId),
  userIdIdx: index("business_members_user_id_idx").on(t.userId),
  inviteTokenIdx: index("business_members_invite_token_idx").on(t.inviteToken),
  uniqueUserId: unique("business_members_user_id_unique").on(t.userId),
  uniqueDerivationIndex: unique("business_members_derivation_index_unique").on(t.businessId, t.derivationIndex),
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
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  txIntentId: uuid("tx_intent_id").references(() => txIntents.id, { onDelete: "set null" }),
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

export const txIntents = pgTable("tx_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: txIntentTypeEnum("type").notNull().default("transfer"),
  payload: jsonb("payload").notNull(),
  signedRaw: text("signed_raw"),
  txHash: text("tx_hash"),
  status: txIntentStatusEnum("status").notNull().default("pending"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => ({
  userIdIdx: index("tx_intents_user_id_idx").on(t.userId),
  idempotencyIdx: unique("tx_intents_idempotency_key_unique").on(t.userId, t.idempotencyKey),
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

export const rateLimitEntries = pgTable("rate_limit_entries", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})

export const tokenScanCursors = pgTable("token_scan_cursors", {
  tokenAddress: text("token_address").notNull(),
  chainId: integer("chain_id").notNull().default(137),
  lastBlock: bigint("last_block", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: unique("token_scan_cursors_pkey").on(t.tokenAddress, t.chainId),
}))

