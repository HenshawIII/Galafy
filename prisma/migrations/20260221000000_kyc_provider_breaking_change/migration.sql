-- KYC Provider Breaking Change: ALAT create-account-face API
-- Tier 1 (BVN + face callback), Tier 2 (NIN + address + face), slim verification tables

-- CreateEnum
CREATE TYPE "Tier1FaceStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable Customer: add Tier 1 and Tier 2 flow fields
ALTER TABLE "Customer" ADD COLUMN "tier1CorrelationId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "tier1TrackingId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "tier1FaceStatus" "Tier1FaceStatus";
ALTER TABLE "Customer" ADD COLUMN "tier1CompletedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "tier2TrackingId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "tier2AddressVerificationStatus" TEXT;

CREATE UNIQUE INDEX "Customer_tier1CorrelationId_key" ON "Customer"("tier1CorrelationId");

-- AlterTable BvnVerification: slim down (keep only providerCheckId, verifiedAt, createdAt)
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "kycCompleted";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "state";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "status";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "bvnCheckStatus";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "firstnameMatch";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "lastnameMatch";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "birthdate";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "gender";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "email";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "firstname";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "lastname";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "middlename";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "lgaOfResidence";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "maritalStatus";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "nationality";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "residentialAddress";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "stateOfResidence";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "enrollmentBank";
ALTER TABLE "BvnVerification" DROP COLUMN IF EXISTS "watchListed";

-- AlterTable NinVerification: slim down
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "state";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "status";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "ninCheckStatus";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "firstnameMatch";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "lastnameMatch";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "ninBirthdate";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "ninGender";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "ninPhone";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "lgaOfResidence";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "stateOfResidence";
ALTER TABLE "NinVerification" DROP COLUMN IF EXISTS "vNin";

-- AlterTable AddressVerification: slim down, add residentialAddressJson
ALTER TABLE "AddressVerification" DROP COLUMN IF EXISTS "houseAddress";
ALTER TABLE "AddressVerification" DROP COLUMN IF EXISTS "houseOwner";
ALTER TABLE "AddressVerification" DROP COLUMN IF EXISTS "confidenceLevel";
ALTER TABLE "AddressVerification" DROP COLUMN IF EXISTS "discoCode";
ALTER TABLE "AddressVerification" DROP COLUMN IF EXISTS "providerTimestamp";
ALTER TABLE "AddressVerification" ADD COLUMN "residentialAddressJson" JSONB;
