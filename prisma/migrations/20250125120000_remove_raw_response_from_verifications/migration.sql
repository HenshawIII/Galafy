-- AlterTable: Remove rawResponse column from NinVerification
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "rawResponse";

-- AlterTable: Remove rawResponse column from BvnVerification
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "rawResponse";

-- AlterTable: Remove rawResponse column from AddressVerification
ALTER TABLE "AddressVerification" DROP COLUMN IF EXISTS "rawResponse";

