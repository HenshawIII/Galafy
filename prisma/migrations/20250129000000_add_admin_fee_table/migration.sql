-- CreateTable: AdminFee table for tracking admin fees separately from user transactions
CREATE TABLE "AdminFee" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "feeType" TEXT NOT NULL,
    "feePercentage" DECIMAL(5,4),
    "relatedTransactionId" TEXT,
    "fundingTransactionId" TEXT,
    "payoutTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COLLECTED',
    "grossAmount" DECIMAL(19,2),
    "netAmount" DECIMAL(19,2),
    "adminWalletAccountNumber" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Index on walletId for faster queries
CREATE INDEX "AdminFee_walletId_idx" ON "AdminFee"("walletId");

-- CreateIndex: Index on customerId for faster queries
CREATE INDEX "AdminFee_customerId_idx" ON "AdminFee"("customerId");

-- CreateIndex: Index on feeType for filtering by fee type
CREATE INDEX "AdminFee_feeType_idx" ON "AdminFee"("feeType");

-- CreateIndex: Index on relatedTransactionId for linking to transactions
CREATE INDEX "AdminFee_relatedTransactionId_idx" ON "AdminFee"("relatedTransactionId");

-- CreateIndex: Index on createdAt for time-based queries
CREATE INDEX "AdminFee_createdAt_idx" ON "AdminFee"("createdAt");

-- CreateIndex: Index on status for filtering by status
CREATE INDEX "AdminFee_status_idx" ON "AdminFee"("status");

-- CreateIndex: Unique constraint on fundingTransactionId (one-to-one relation)
CREATE UNIQUE INDEX "AdminFee_fundingTransactionId_key" ON "AdminFee"("fundingTransactionId");

-- CreateIndex: Unique constraint on payoutTransactionId (one-to-one relation)
CREATE UNIQUE INDEX "AdminFee_payoutTransactionId_key" ON "AdminFee"("payoutTransactionId");

-- AddForeignKey: Link AdminFee to Wallet
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Link AdminFee to Customer
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Link AdminFee to Transaction (optional relation)
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Link AdminFee to FundingTransaction (optional one-to-one relation)
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_fundingTransactionId_fkey" FOREIGN KEY ("fundingTransactionId") REFERENCES "FundingTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Link AdminFee to PayoutTransaction (optional one-to-one relation)
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_payoutTransactionId_fkey" FOREIGN KEY ("payoutTransactionId") REFERENCES "PayoutTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

