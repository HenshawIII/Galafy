-- AlterTable
-- Update the default value for dailyLimit from 100000000 (1000 Naira) to 100000000000 (1 million Naira)
-- This aligns with the requirement that 1 million Naira should be the default daily withdrawal limit
ALTER TABLE "WithdrawalLimit" ALTER COLUMN "dailyLimit" SET DEFAULT 100000000000;

-- Update existing records that have the old default value to the new default
-- Only update records that have the old default value (100000000) and haven't been customized
UPDATE "WithdrawalLimit" 
SET "dailyLimit" = 100000000000 
WHERE "dailyLimit" = 100000000;

