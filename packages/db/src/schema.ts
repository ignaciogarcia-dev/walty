import { pgTable, serial, text, timestamp, pgEnum, integer, unique, uuid, boolean, index, jsonb, bigint, uniqueIndex, customType } from "drizzle-orm/pg-core"

// Postgres bytea column — driver returns Buffer, we keep it as Buffer.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
})

export const txStatusEnum = pgEnum("tx_status", ["pending", "confirmed", "failed"])
export const txIntentStatusEnum = pgEnum("tx_intent_status", ["pending", "signed", "broadcasting", "broadcasted", "confirmed", "failed", "expired"])
export const businessMemberRoleEnum = pgEnum("business_member_role", ["cashier"])
export const businessMemberStatusEnum = pgEnum("business_member_status", ["invited", "active", "suspended", "revoked"])
export const txIntentTypeEnum = pgEnum("tx_intent_type", ["transfer", "refund", "gas_funding", "collection"])
export const refundRequestStatusEnum = pgEnum("refund_request_status", ["pending", "approved", "approved_pending_signature", "rejected", "executed"])
export const posDeviceStatusEnum = pgEnum("pos_device_status", ["pending", "active", "revoked"])

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
}, (t) => ({
  uniqUserAddr: unique("addresses_user_id_address_unique").on(t.userId, t.address),
}))

export const walletNonces = pgTable("wallet_nonces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nonce: text("nonce").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
})

// One row per logged-in device session. The id is the `sid` embedded in the
// JWT; auth is stateful so revoking a row invalidates that device on its next
// request. `trustedAt` is set once the device proves it holds the wallet key
// (signs an attestation challenge); until then the session is "pending".
export const deviceSessions = pgTable("device_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  trustedAt: timestamp("trusted_at"),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => ({
  byUser: index("device_sessions_user_id_idx").on(t.userId),
}))

// A pending device (one with no seed) asks an already-trusted device to
// approve releasing the encrypted backup to it. The request is bound to the
// requesting session; only a trusted session can approve, and the gate on
// GET /wallet/backup checks for an approved, unexpired row.
export const devicePairingRequests = pgTable("device_pairing_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => deviceSessions.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  requestIp: text("request_ip"),
  approvedBySessionId: uuid("approved_by_session_id").references(() => deviceSessions.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  bySession: index("device_pairing_requests_session_id_idx").on(t.sessionId),
}))

export const businessSettings = pgTable("business_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

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
  operatorId: integer("operator_id").references(() => users.id, { onDelete: "restrict" }),
  // Set when the request was created by a headless POS device (operatorId stays
  // null in that case). Attributes the sale to the terminal for reporting and
  // links to the POS's derived child wallet for refunds/sweeps.
  posDeviceId: integer("pos_device_id").references(() => posDevices.id, { onDelete: "set null" }),
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

// A headless POS terminal (e.g. a Raspberry Pi) owned by a business. Like a
// cashier, its funds live in an HD-under-MPC child wallet ("m/derivationIndex")
// custodied by the owner; the terminal never signs on-chain. Unlike a cashier,
// it authenticates by signing each API request with an Ed25519 keypair whose
// private key lives only on the device — the server stores only publicKey.
// status: pending (created, never seen) → active (first valid request) → revoked.
export const posDevices = pgTable("pos_devices", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull(),
  status: posDeviceStatusEnum("status").notNull().default("pending"),
  derivationIndex: integer("derivation_index").notNull(),
  walletAddress: text("wallet_address").notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => ({
  businessIdIdx: index("pos_devices_business_id_idx").on(t.businessId),
  publicKeyIdx: index("pos_devices_public_key_idx").on(t.publicKey),
  uniqueDerivationIndex: unique("pos_devices_derivation_index_unique").on(t.businessId, t.derivationIndex),
}))

// Anti-replay store for POS request signatures. Each signed request carries a
// unique nonce; the unique(posDeviceId, nonce) constraint makes a replayed
// signature fail to insert. Rows are pruned after expiresAt.
export const posRequestNonces = pgTable("pos_request_nonces", {
  id: serial("id").primaryKey(),
  posDeviceId: integer("pos_device_id").notNull().references(() => posDevices.id, { onDelete: "cascade" }),
  nonce: text("nonce").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => ({
  uniqueNonce: unique("pos_request_nonces_device_nonce_unique").on(t.posDeviceId, t.nonce),
  expiresAtIdx: index("pos_request_nonces_expires_at_idx").on(t.expiresAt),
}))

export const refundRequests = pgTable("refund_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentRequestId: uuid("payment_request_id").notNull().references(() => paymentRequests.id, { onDelete: "cascade" }),
  // The user who requested the refund. Null when initiated by a POS device,
  // in which case posDeviceId identifies the terminal instead.
  requestedBy: integer("requested_by").references(() => users.id, { onDelete: "restrict" }),
  posDeviceId: integer("pos_device_id").references(() => posDevices.id, { onDelete: "set null" }),
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
  payloadHash: text("payload_hash").notNull().default(""),
  signedRaw: text("signed_raw"),
  txHash: text("tx_hash"),
  status: txIntentStatusEnum("status").notNull().default("pending"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

// One Safe treasury per (user, chain). Stores the on-chain Safe address for
// the business owner's treasury wallet. Status transitions: pending → deployed.
// rolesStatus lifecycle: none → enabled (modifier deployed + enabled on Safe)
//   → scoped (manager role scoped + allowance set).
export const businessTreasuries = pgTable("business_treasuries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  chainId: integer("chain_id").notNull(),
  safeAddress: text("safe_address").notNull(),
  status: text("status").notNull().default("pending"), // pending | deployed
  deployTxHash: text("deploy_tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  rolesModifierAddress: text("roles_modifier_address"),
  rolesStatus: text("roles_status").notNull().default("none"), // none | enabled | scoped
  managerCap: text("manager_cap"), // USDC base-units cap for the manager role; null until scoped
}, (t) => ({
  byUser: uniqueIndex("business_treasuries_user_chain_idx").on(t.userId, t.chainId),
}))

// MPC key record — one per user key (keyId). Status: dkg_pending | active.
export const mpcKeys = pgTable("mpc_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pubkey: text("pubkey").notNull(),
  address: text("address").notNull(),
  status: text("status").notNull().default("dkg_pending"), // dkg_pending | active
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUser: index("mpc_keys_user_id_idx").on(t.userId),
}))

// Server-side AES-GCM encrypted share envelope — one row per mpc_keys row.
// The AAD (userId|keyId|pubkey|version) is reconstructed at decrypt time from
// the mpc_keys row + this row's version; it is NOT stored here.
export const mpcServerShares = pgTable("mpc_server_shares", {
  keyId: uuid("key_id").primaryKey().references(() => mpcKeys.id, { onDelete: "cascade" }),
  ciphertext: bytea("ciphertext").notNull(),   // AES-GCM ciphertext + 16-byte tag (~247 KB + 16)
  nonce: bytea("nonce").notNull(),             // 12 bytes
  wrappedDek: bytea("wrapped_dek").notNull(),  // KMS-wrapped DEK
  version: integer("version").notNull(),       // must match the AAD version used at encrypt
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// HD-under-MPC child addresses for a key. derivationIndex 0 = master (owner);
// i>=1 = cashier i's child key ("m/i"). Server-authoritative: a row is written
// when the address is derived (server intersects its own sign [R,S]); the sign
// ceremony looks it up to assemble/verify a child signature.
export const mpcChildAddresses = pgTable("mpc_child_addresses", {
  keyId: uuid("key_id").notNull().references(() => mpcKeys.id, { onDelete: "cascade" }),
  derivationIndex: integer("derivation_index").notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uq: uniqueIndex("mpc_child_addresses_key_index_uq").on(t.keyId, t.derivationIndex),
}))

