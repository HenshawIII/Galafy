-- AlterTable
-- Add admin approval fields to PayoutTransaction model
-- These fields enable the approval workflow for withdrawals that exceed daily limits

-- Add approval tracking fields
ALTER TABLE "PayoutTransaction" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PayoutTransaction" ADD COLUMN "approvalReason" TEXT;
ALTER TABLE "PayoutTransaction" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "PayoutTransaction" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "PayoutTransaction" ADD COLUMN "rejectedBy" TEXT;
ALTER TABLE "PayoutTransaction" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "PayoutTransaction" ADD COLUMN "rejectionReason" TEXT;

-- Add foreign key constraints for approvedBy and rejectedBy
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for efficient querying of withdrawals requiring approval
CREATE INDEX "PayoutTransaction_requiresApproval_status_idx" ON "PayoutTransaction"("requiresApproval", "status");

