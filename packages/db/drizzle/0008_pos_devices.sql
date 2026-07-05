-- NOTE: this repo syncs its schema via `drizzle-kit push` (pnpm db:migrate) from
-- packages/db/src/schema.ts. This SQL file is ILLUSTRATIVE / FOR-AUDIT ONLY and
-- is NOT applied by the migrate pipeline.

-- POS devices: headless terminals (e.g. Raspberry Pi) that create charges on
-- behalf of a business. Funds live in an HD-under-MPC child wallet custodied by
-- the owner (like a cashier); the terminal authenticates by signing each API
-- request with an Ed25519 keypair whose private key never leaves the device.

DO $$ BEGIN
    CREATE TYPE "pos_device_status" AS ENUM ('pending', 'active', 'revoked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "pos_devices" (
    "id" serial PRIMARY KEY NOT NULL,
    "business_id" integer NOT NULL,
    "name" text NOT NULL,
    "public_key" text NOT NULL,
    "status" "pos_device_status" DEFAULT 'pending' NOT NULL,
    "derivation_index" integer NOT NULL,
    "wallet_address" text NOT NULL,
    "last_seen_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "revoked_at" timestamp,
    CONSTRAINT "pos_devices_business_id_users_id_fk" FOREIGN KEY ("business_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "pos_devices_derivation_index_unique" UNIQUE ("business_id", "derivation_index")
);

CREATE INDEX IF NOT EXISTS "pos_devices_business_id_idx" ON "pos_devices" ("business_id");
CREATE INDEX IF NOT EXISTS "pos_devices_public_key_idx" ON "pos_devices" ("public_key");

-- Anti-replay store for POS request signatures. unique(pos_device_id, nonce)
-- makes a replayed signature fail to insert. Rows pruned after expires_at.
CREATE TABLE IF NOT EXISTS "pos_request_nonces" (
    "id" serial PRIMARY KEY NOT NULL,
    "pos_device_id" integer NOT NULL,
    "nonce" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    CONSTRAINT "pos_request_nonces_pos_device_id_pos_devices_id_fk" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "pos_request_nonces_device_nonce_unique" UNIQUE ("pos_device_id", "nonce")
);

CREATE INDEX IF NOT EXISTS "pos_request_nonces_expires_at_idx" ON "pos_request_nonces" ("expires_at");

-- Attribute payment requests and refund requests to a POS terminal.
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "pos_device_id" integer;
ALTER TABLE "payment_requests" DROP CONSTRAINT IF EXISTS "payment_requests_pos_device_id_pos_devices_id_fk";
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_pos_device_id_pos_devices_id_fk" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE set null ON UPDATE no action;

-- refund_requests.requested_by becomes nullable (POS-initiated refunds have no user).
ALTER TABLE "refund_requests" ALTER COLUMN "requested_by" DROP NOT NULL;
ALTER TABLE "refund_requests" ADD COLUMN IF NOT EXISTS "pos_device_id" integer;
ALTER TABLE "refund_requests" DROP CONSTRAINT IF EXISTS "refund_requests_pos_device_id_pos_devices_id_fk";
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_pos_device_id_pos_devices_id_fk" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE set null ON UPDATE no action;
