-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isBalanceRestricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "balanceRestrictedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "balanceRestrictionReason" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "providerRestrictionStatus" TEXT;
