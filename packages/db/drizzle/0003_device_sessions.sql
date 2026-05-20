-- Multi-device: per-device session rows backing stateful auth.
-- The id is the `sid` carried in the JWT; revoking a row invalidates that
-- device on its next request. trusted_at is set once the device proves it
-- holds the wallet key (signed attestation challenge).

CREATE TABLE IF NOT EXISTS "device_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" integer NOT NULL,
    "label" text NOT NULL,
    "trusted_at" timestamp,
    "last_seen_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "revoked_at" timestamp,
    CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "device_sessions_user_id_idx" ON "device_sessions" ("user_id");
