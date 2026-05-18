-- Refactor to business-only: drop person concept, P2P features, and harden audit.
-- Destructive: removes all users that were tagged as person (or untyped) along with their cascading data.

DELETE FROM "users" WHERE "user_type" = 'person' OR "user_type" IS NULL;

DROP TABLE IF EXISTS "contacts";
DROP TABLE IF EXISTS "user_profiles";

ALTER TABLE "users" DROP COLUMN IF EXISTS "user_type";

CREATE TABLE IF NOT EXISTS "business_settings" (
    "user_id" integer PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "business_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);

ALTER TABLE "payment_requests" DROP CONSTRAINT IF EXISTS "payment_requests_operator_id_users_id_fk";
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tx_intents" ADD COLUMN IF NOT EXISTS "payload_hash" text NOT NULL DEFAULT '';
ALTER TABLE "tx_intents" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
