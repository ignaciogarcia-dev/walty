-- NOTE: this repo syncs its schema via `drizzle-kit push` (pnpm db:migrate) from
-- packages/db/src/schema.ts. This SQL file is ILLUSTRATIVE / FOR-AUDIT ONLY and
-- is NOT applied by the migrate pipeline. The drizzle snapshot in meta/ is stale
-- (only 0000 was generated) and should be regenerated as a separate cleanup task.

-- MPC key records and server-side encrypted share envelopes.
-- mpc_keys: one row per user key (keyId); status: dkg_pending | active.
-- mpc_server_shares: AES-GCM envelope for the server share; keyId is both PK and FK.
-- AAD (userId|keyId|pubkey|version) is reconstructed at decrypt time — not stored.

CREATE TABLE IF NOT EXISTS "mpc_keys" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" integer NOT NULL,
    "pubkey" text NOT NULL,
    "address" text NOT NULL,
    "status" text DEFAULT 'dkg_pending' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "mpc_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "mpc_keys_user_id_idx" ON "mpc_keys" ("user_id");

CREATE TABLE IF NOT EXISTS "mpc_server_shares" (
    "key_id" uuid PRIMARY KEY NOT NULL,
    "ciphertext" bytea NOT NULL,
    "nonce" bytea NOT NULL,
    "wrapped_dek" bytea NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "mpc_server_shares_key_id_mpc_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "mpc_keys"("id") ON DELETE cascade ON UPDATE no action
);
