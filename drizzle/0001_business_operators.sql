CREATE TYPE "public"."business_member_role" AS ENUM('manager', 'cashier', 'waiter');
--> statement-breakpoint
CREATE TYPE "public"."business_member_status" AS ENUM('invited', 'active', 'suspended', 'revoked');
--> statement-breakpoint
CREATE TYPE "public"."refund_request_status" AS ENUM('pending', 'approved', 'rejected', 'executed');
--> statement-breakpoint
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
  CONSTRAINT "business_members_invite_token_unique" UNIQUE("invite_token")
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
  "reviewed_by" integer REFERENCES "public"."users"("id") ON DELETE set null
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
ALTER TABLE "payment_requests" ADD COLUMN "operator_id" integer REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "business_members_business_id_idx" ON "business_members"("business_id");
--> statement-breakpoint
CREATE INDEX "business_members_user_id_idx" ON "business_members"("user_id");
--> statement-breakpoint
CREATE INDEX "business_members_invite_token_idx" ON "business_members"("invite_token");
--> statement-breakpoint
CREATE INDEX "refund_requests_business_id_idx" ON "refund_requests"("business_id");
--> statement-breakpoint
CREATE INDEX "business_audit_logs_business_id_idx" ON "business_audit_logs"("business_id");
