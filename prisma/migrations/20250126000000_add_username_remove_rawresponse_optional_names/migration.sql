-- AlterTable: Add username field to User table
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- CreateIndex: Create unique index on username
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AlterTable: Make firstName optional in User table
ALTER TABLE "User" ALTER COLUMN "firstName" DROP NOT NULL;

-- AlterTable: Make lastName optional in User table
ALTER TABLE "User" ALTER COLUMN "lastName" DROP NOT NULL;

-- AlterTable: Remove rawResponse from NinVerification table
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "rawResponse";

-- AlterTable: Remove rawResponse from BvnVerification table
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "rawResponse";

-- AlterTable: Remove rawResponse from AddressVerification table
ALTER TABLE "AddressVerification" DROP COLUMN IF EXISTS "rawResponse";


