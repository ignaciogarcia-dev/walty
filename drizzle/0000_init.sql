-- Enums
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'confirmed', 'failed');
--> statement-breakpoint
CREATE TYPE "public"."business_member_role" AS ENUM('cashier');
--> statement-breakpoint
CREATE TYPE "public"."business_member_status" AS ENUM('invited', 'active', 'suspended', 'revoked');
--> statement-breakpoint
CREATE TYPE "public"."refund_request_status" AS ENUM('pending', 'approved', 'approved_pending_signature', 'rejected', 'executed');
--> statement-breakpoint
CREATE TYPE "public"."tx_intent_type" AS ENUM('transfer', 'refund', 'gas_funding', 'collection');
--> statement-breakpoint
CREATE TYPE "public"."tx_intent_status" AS ENUM('pending', 'signed', 'broadcasting', 'broadcasted', 'confirmed', 'failed', 'expired');
--> statement-breakpoint

-- Core tables
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"user_type" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"address" text NOT NULL,
	CONSTRAINT "addresses_user_id_address_unique" UNIQUE("user_id","address")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"chain_id" integer DEFAULT 137 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"username" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wallet_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"wallet_address" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"salt" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wallet_nonces" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"nonce" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"hash" text NOT NULL,
	"log_index" integer NOT NULL DEFAULT -1,
	"type" text,
	"chain_id" integer DEFAULT 1 NOT NULL,
	"chain_type" text DEFAULT 'EVM' NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"token_address" text,
	"token_symbol" text NOT NULL,
	"value" text NOT NULL,
	"status" "tx_status" DEFAULT 'pending' NOT NULL,
	"gas_used" text,
	"block_number" text,
	"intent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_hash_logidx_unique" UNIQUE("hash", "log_index")
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"chain_id" integer DEFAULT 137 NOT NULL,
	"amount_usd" text NOT NULL,
	"amount_token" text NOT NULL,
	"token" text NOT NULL,
	"token_address" text NOT NULL,
	"token_decimals" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"tx_block_number" text,
	"payer_address" text,
	"start_block" text NOT NULL,
	"last_scanned_block" text NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"required_confirmations" integer DEFAULT 2 NOT NULL,
	"detected_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_split_payment" boolean DEFAULT false NOT NULL,
	"total_paid_token" text DEFAULT '0',
	"total_paid_usd" text DEFAULT '0',
	"operator_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
	CONSTRAINT "payment_requests_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint

-- Business operators
CREATE TABLE "business_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"role" "business_member_role" NOT NULL,
	"status" "business_member_status" NOT NULL DEFAULT 'invited',
	"invite_token" uuid NOT NULL DEFAULT gen_random_uuid(),
	"invite_email" text,
	"invited_by" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE restrict,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp,
	"derivation_index" integer,
	"wallet_address" text,
	CONSTRAINT "business_members_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "business_members_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "business_members_derivation_index_unique" UNIQUE("business_id", "derivation_index")
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_request_id" uuid NOT NULL REFERENCES "public"."payment_requests"("id") ON DELETE cascade,
	"requested_by" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE restrict,
	"business_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"amount_token" text NOT NULL,
	"amount_usd" text NOT NULL,
	"destination_address" text NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_request_status" NOT NULL DEFAULT 'pending',
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"approved_by" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"approved_at" timestamp,
	"tx_intent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "business_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"operator_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE restrict,
	"action" text NOT NULL,
	"metadata" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tx_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"type" "tx_intent_type" NOT NULL DEFAULT 'transfer',
	"payload" jsonb NOT NULL,
	"signed_raw" text,
	"tx_hash" text,
	"status" "tx_intent_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_payment_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_request_id" uuid NOT NULL REFERENCES "public"."payment_requests"("id") ON DELETE cascade,
	"tx_hash" text NOT NULL,
	"payer_address" text NOT NULL,
	"amount_token" text NOT NULL,
	"amount_usd" text NOT NULL,
	"token_symbol" text NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"block_number" text,
	"detected_at" timestamp,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "split_payment_contributions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_entries" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint

-- Token scan cursors (shared per-token cursor for the backend reconciler)
CREATE TABLE "token_scan_cursors" (
	"token_address" text NOT NULL,
	"chain_id" integer NOT NULL DEFAULT 137,
	"last_block" bigint NOT NULL DEFAULT 0,
	"updated_at" timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY ("token_address", "chain_id")
);
--> statement-breakpoint

-- Indexes
CREATE INDEX "business_members_business_id_idx" ON "business_members"("business_id");
--> statement-breakpoint
CREATE INDEX "business_members_user_id_idx" ON "business_members"("user_id");
--> statement-breakpoint
CREATE INDEX "business_members_invite_token_idx" ON "business_members"("invite_token");
--> statement-breakpoint
CREATE INDEX "refund_requests_business_id_idx" ON "refund_requests"("business_id");
--> statement-breakpoint
CREATE INDEX "business_audit_logs_business_id_idx" ON "business_audit_logs"("business_id");
--> statement-breakpoint
CREATE INDEX "tx_intents_user_id_idx" ON "tx_intents"("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tx_intents_idempotency_key_unique" ON "tx_intents"("user_id", "idempotency_key");
--> statement-breakpoint

-- FK added after tx_intents exists (transactions is defined before tx_intents)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_intent_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."tx_intents"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "transactions_intent_id_idx" ON "transactions" ("intent_id");
--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_tx_intent_id_fk" FOREIGN KEY ("tx_intent_id") REFERENCES "public"."tx_intents"("id") ON DELETE SET NULL;
