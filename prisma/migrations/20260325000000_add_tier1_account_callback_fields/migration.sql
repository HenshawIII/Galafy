-- Add fields required for Tier 1 account (nuban) creation callback
-- Used to provision the local Wallet record when provider callback is received

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tier1AccountStatus" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tier1Nuban" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tier1NubanName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tier1AccountCompletedAt" TIMESTAMP;

