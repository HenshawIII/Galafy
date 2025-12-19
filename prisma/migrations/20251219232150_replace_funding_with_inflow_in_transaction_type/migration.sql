-- Update TransactionType enum: Replace FUNDING with INFLOW
-- Step 1: Temporarily convert column to text
ALTER TABLE "Transaction" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- Step 2: Drop the old enum
DROP TYPE "TransactionType";

-- Step 3: Create the new enum with INFLOW instead of FUNDING
CREATE TYPE "TransactionType" AS ENUM ('INFLOW', 'SPRAY', 'PAYOUT', 'REFUND', 'ADJUSTMENT');

-- Step 4: Convert existing data - map FUNDING to INFLOW, keep others as-is
ALTER TABLE "Transaction" ALTER COLUMN "type" TYPE "TransactionType" USING 
  CASE 
    WHEN "type" = 'FUNDING' THEN 'INFLOW'::"TransactionType"
    WHEN "type" = 'SPRAY' THEN 'SPRAY'::"TransactionType"
    WHEN "type" = 'PAYOUT' THEN 'PAYOUT'::"TransactionType"
    WHEN "type" = 'REFUND' THEN 'REFUND'::"TransactionType"
    WHEN "type" = 'ADJUSTMENT' THEN 'ADJUSTMENT'::"TransactionType"
    ELSE 'INFLOW'::"TransactionType"
  END;
