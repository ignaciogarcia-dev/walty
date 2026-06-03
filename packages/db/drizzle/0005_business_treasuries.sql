-- Per-business Safe treasury: one row per (user, chain). Stores the on-chain
-- Safe address for the business owner's treasury wallet. Status: pending | deployed.

CREATE TABLE IF NOT EXISTS "business_treasuries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" integer NOT NULL,
    "chain_id" integer NOT NULL,
    "safe_address" text NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "deploy_tx_hash" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "business_treasuries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_treasuries_user_chain_idx" ON "business_treasuries" ("user_id","chain_id");
