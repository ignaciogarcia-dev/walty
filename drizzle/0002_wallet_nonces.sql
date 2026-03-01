CREATE TABLE "wallet_nonces" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
