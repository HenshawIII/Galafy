-- AlterTable: Update Wallet table - Change DECIMAL precision to (19,2) for kobo precision
ALTER TABLE "Wallet" 
  ALTER COLUMN "availableBalance" TYPE DECIMAL(19,2) USING "availableBalance"::numeric(19,2),
  ALTER COLUMN "ledgerBalance" TYPE DECIMAL(19,2) USING "ledgerBalance"::numeric(19,2),
  ALTER COLUMN "overdraft" TYPE DECIMAL(19,2) USING "overdraft"::numeric(19,2);

-- AlterTable: Update Transaction table - Change DECIMAL precision to (19,2)
ALTER TABLE "Transaction" 
  ALTER COLUMN "amount" TYPE DECIMAL(19,2) USING "amount"::numeric(19,2);

-- AlterTable: Update Event table - Change DECIMAL precision to (19,2)
ALTER TABLE "Event" 
  ALTER COLUMN "sprayGoal" TYPE DECIMAL(19,2) USING "sprayGoal"::numeric(19,2),
  ALTER COLUMN "minSprayAmount" TYPE DECIMAL(19,2) USING "minSprayAmount"::numeric(19,2);

-- AlterTable: Update Spray table - Change DECIMAL precision to (19,2)
ALTER TABLE "Spray" 
  ALTER COLUMN "totalAmount" TYPE DECIMAL(19,2) USING "totalAmount"::numeric(19,2);

-- AlterTable: Update FundingTransaction table - Change DECIMAL precision to (19,2)
ALTER TABLE "FundingTransaction" 
  ALTER COLUMN "amount" TYPE DECIMAL(19,2) USING "amount"::numeric(19,2),
  ALTER COLUMN "fee" TYPE DECIMAL(19,2) USING "fee"::numeric(19,2);

-- AlterTable: Update PayoutTransaction table - Change DECIMAL precision to (19,2)
ALTER TABLE "PayoutTransaction" 
  ALTER COLUMN "amount" TYPE DECIMAL(19,2) USING "amount"::numeric(19,2),
  ALTER COLUMN "fee" TYPE DECIMAL(19,2) USING "fee"::numeric(19,2);

