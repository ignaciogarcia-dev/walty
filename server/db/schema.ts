import { pgTable, serial, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core"

export const txStatusEnum = pgEnum("tx_status", ["pending", "confirmed", "failed"])

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  address: text("address").notNull(),
})

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  amount: text("amount").notNull(),
  txHash: text("tx_hash").notNull().unique(),
  status: txStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const walletNonces = pgTable("wallet_nonces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  nonce: text("nonce").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
})