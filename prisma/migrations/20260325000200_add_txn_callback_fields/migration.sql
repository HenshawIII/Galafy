-- Extend Transaction with provider callback fields for ALAT debit-wallet callbacks

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "securityInfoHash" TEXT;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "providerPlatformTransactionReference" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "providerTransactionStan" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "providerOriginalTransactionDate" TIMESTAMP;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "providerStatus" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "providerCallbackReceivedAt" TIMESTAMP;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "destinationAccountNumber" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "destinationAccountName" TEXT;

-- Note: uniqueness is enforced by Prisma schema for providerPlatformTransactionReference.
-- If your DB already has constraints, adjust accordingly.

