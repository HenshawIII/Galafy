-- CreateEnum
CREATE TYPE "Tier3UpgradeStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tier3UpgradeStatus" "Tier3UpgradeStatus";
