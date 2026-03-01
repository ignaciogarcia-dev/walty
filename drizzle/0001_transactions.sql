CREATE TYPE "public"."tx_status" AS ENUM('pending', 'confirmed', 'failed');
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" text NOT NULL,
	"tx_hash" text NOT NULL,
	"status" "tx_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "transactions_tx_hash_unique" UNIQUE("tx_hash")
);
