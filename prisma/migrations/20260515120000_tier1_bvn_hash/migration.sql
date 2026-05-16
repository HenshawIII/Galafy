-- DropIndex
DROP INDEX IF EXISTS "Customer_tier1PendingBvn_key";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tier1BvnHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_tier1BvnHash_key" ON "Customer"("tier1BvnHash");
