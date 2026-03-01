ALTER TABLE "addresses" ALTER COLUMN "user_id" TYPE integer USING "user_id"::integer;
ALTER TABLE "transactions" ALTER COLUMN "user_id" TYPE integer USING "user_id"::integer;
