-- Multi-device pairing: a pending (untrusted) device session requests that an
-- already-trusted device approve releasing the encrypted backup to it. The
-- gate on GET /wallet/backup honours an approved, unexpired row.

CREATE TABLE IF NOT EXISTS "device_pairing_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" integer NOT NULL,
    "session_id" uuid NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "request_ip" text,
    "approved_by_session_id" uuid,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "device_pairing_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "device_pairing_requests_session_id_device_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "device_sessions"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "device_pairing_requests_approved_by_session_id_device_sessions_id_fk" FOREIGN KEY ("approved_by_session_id") REFERENCES "device_sessions"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "device_pairing_requests_session_id_idx" ON "device_pairing_requests" ("session_id");
