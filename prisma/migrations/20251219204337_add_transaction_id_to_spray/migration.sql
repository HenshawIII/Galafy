-- AlterTable
-- Add transactionId column to Spray table (nullable, as it's optional)
ALTER TABLE "Spray" ADD COLUMN "transactionId" TEXT;

-- CreateIndex
-- Add unique constraint on transactionId (only non-null values are unique)
-- Using partial unique index to allow multiple NULL values
CREATE UNIQUE INDEX "Spray_transactionId_key" ON "Spray"("transactionId") WHERE "transactionId" IS NOT NULL;

-- AddForeignKey
-- Add foreign key constraint to Transaction table
ALTER TABLE "Spray" ADD CONSTRAINT "Spray_transactionId_fkey" 
  FOREIGN KEY ("transactionId") 
  REFERENCES "Transaction"("id") 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;
