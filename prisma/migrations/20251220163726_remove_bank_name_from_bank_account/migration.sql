-- AlterTable: Remove bankName column from BankAccount table
ALTER TABLE "BankAccount" DROP COLUMN IF EXISTS "bankName";
