import { pgTable, serial, text, timestamp, pgEnum, integer, unique, uuid, boolean } from "drizzle-orm/pg-core"

export const txStatusEnum = pgEnum("tx_status", ["pending", "confirmed", "failed"])

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
})

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
