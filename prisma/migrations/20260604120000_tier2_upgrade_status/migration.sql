-- CreateEnum
CREATE TYPE "Tier2UpgradeStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "tier2UpgradeStatus" "Tier2UpgradeStatus";

-- Backfill existing Tier 2+ customers
UPDATE "Customer"
SET "tier2UpgradeStatus" = 'COMPLETED'
WHERE "tier" IN ('Tier_2', 'Tier_3');
