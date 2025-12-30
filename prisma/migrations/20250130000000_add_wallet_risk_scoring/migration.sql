-- Add risk scoring fields to Wallet table
ALTER TABLE "Wallet" 
  ADD COLUMN "riskScore" DECIMAL(5,2),
  ADD COLUMN "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "riskScoreUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "riskMetadata" JSONB;

-- Create index on riskStatus for efficient queries
CREATE INDEX "Wallet_riskStatus_idx" ON "Wallet"("riskStatus");

-- Update existing wallets to have NORMAL status (already set by default, but explicit for clarity)
UPDATE "Wallet" SET "riskStatus" = 'NORMAL' WHERE "riskStatus" IS NULL;

