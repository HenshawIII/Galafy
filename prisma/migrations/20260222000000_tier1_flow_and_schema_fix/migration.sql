-- Tier 1 flow and schema fix: tier1PendingBvn for callback lookup; firstName/lastName optional

ALTER TABLE "Customer" ADD COLUMN "tier1PendingBvn" TEXT;
CREATE UNIQUE INDEX "Customer_tier1PendingBvn_key" ON "Customer"("tier1PendingBvn");

ALTER TABLE "Customer" ALTER COLUMN "firstName" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "lastName" DROP NOT NULL;
