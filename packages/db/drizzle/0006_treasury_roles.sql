-- Add Zodiac Roles state columns to business_treasuries.
-- rolesStatus lifecycle: none → enabled (modifier deployed + enabled on Safe)
--   → scoped (manager role scoped + allowance set).

ALTER TABLE "business_treasuries" ADD COLUMN IF NOT EXISTS "roles_modifier_address" text;
ALTER TABLE "business_treasuries" ADD COLUMN IF NOT EXISTS "roles_status" text DEFAULT 'none' NOT NULL;
ALTER TABLE "business_treasuries" ADD COLUMN IF NOT EXISTS "manager_cap" text;
