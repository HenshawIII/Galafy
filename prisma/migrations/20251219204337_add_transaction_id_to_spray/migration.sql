-- AlterTable
-- Add transactionId column to Spray table (nullable, as it's optional)
ALTER TABLE "Spray" ADD COLUMN IF NOT EXISTS "transactionId" TEXT;

-- CreateIndex
-- Add unique constraint on transactionId (only non-null values are unique)
-- Using partial unique index to allow multiple NULL values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'Spray_transactionId_key' 
    AND tablename = 'Spray'
  ) THEN
    CREATE UNIQUE INDEX "Spray_transactionId_key" ON "Spray"("transactionId") WHERE "transactionId" IS NOT NULL;
  END IF;
END $$;

-- AddForeignKey
-- Add foreign key constraint to Transaction table
-- Only add if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Spray_transactionId_fkey'
  ) THEN
    ALTER TABLE "Spray" ADD CONSTRAINT "Spray_transactionId_fkey" 
      FOREIGN KEY ("transactionId") 
      REFERENCES "Transaction"("id") 
      ON DELETE SET NULL 
      ON UPDATE CASCADE;
  END IF;
END $$;
