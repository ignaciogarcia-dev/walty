ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "received_amount_token" text;
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "received_amount_usd" text;
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "payment_discrepancy" text;
