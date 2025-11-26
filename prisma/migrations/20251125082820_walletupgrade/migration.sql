/*
  Warnings:

  - You are about to drop the column `username` on the `User` table. All the data in the column will be lost.
  - The `kycTier` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[phone]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `firstName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "KycTier" AS ENUM ('Tier_0', 'Tier_1', 'Tier_2', 'Tier_3');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "username",
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT,
DROP COLUMN "kycTier",
ADD COLUMN     "kycTier" "KycTier" NOT NULL DEFAULT 'Tier_0';

-- DropEnum
DROP TYPE "kycTier";

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "organizationId" TEXT,
    "customerTypeId" TEXT,
    "countryId" TEXT,
    "tier" "KycTier" NOT NULL DEFAULT 'Tier_0',
    "providerTierCode" INTEGER NOT NULL DEFAULT 0,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "dob" TIMESTAMP(3),
    "city" TEXT,
    "address" TEXT,
    "mobileNumber" TEXT,
    "emailAddress" TEXT,
    "isCorporateVerified" BOOLEAN,
    "providerDateCreated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NinVerification" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerCheckId" INTEGER,
    "state" TEXT,
    "status" TEXT,
    "ninCheckStatus" TEXT,
    "firstnameMatch" BOOLEAN,
    "lastnameMatch" BOOLEAN,
    "nin" TEXT NOT NULL,
    "ninBirthdate" TIMESTAMP(3),
    "ninGender" TEXT,
    "ninPhone" TEXT,
    "lgaOfResidence" TEXT,
    "stateOfResidence" TEXT,
    "photoUrl" TEXT,
    "vNin" TEXT,
    "rawResponse" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NinVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BvnVerification" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "kycCompleted" BOOLEAN,
    "providerCheckId" INTEGER,
    "state" TEXT,
    "status" TEXT,
    "bvnCheckStatus" TEXT,
    "firstnameMatch" BOOLEAN,
    "lastnameMatch" BOOLEAN,
    "bvn" TEXT NOT NULL,
    "birthdate" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "firstname" TEXT,
    "lastname" TEXT,
    "middlename" TEXT,
    "lgaOfResidence" TEXT,
    "maritalStatus" TEXT,
    "nationality" TEXT,
    "residentialAddress" TEXT,
    "stateOfResidence" TEXT,
    "enrollmentBank" TEXT,
    "watchListed" TEXT,
    "photoUrl" TEXT,
    "rawResponse" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BvnVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressVerification" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "houseAddress" TEXT,
    "houseOwner" TEXT,
    "confidenceLevel" INTEGER,
    "discoCode" TEXT,
    "providerStatus" TEXT,
    "providerMessage" TEXT,
    "providerTimestamp" TIMESTAMP(3),
    "rawResponse" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerWalletId" TEXT,
    "walletGroupId" TEXT,
    "walletRestrictionId" TEXT,
    "walletClassificationId" TEXT,
    "currencyId" TEXT NOT NULL,
    "availableBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ledgerBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overdraft" DECIMAL(65,30) DEFAULT 0,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "mobNum" TEXT,
    "virtualAccountNumber" TEXT,
    "virtualBankCode" TEXT,
    "virtualBankName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_providerCustomerId_key" ON "Customer"("providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "NinVerification_customerId_key" ON "NinVerification"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BvnVerification_customerId_key" ON "BvnVerification"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AddressVerification_customerId_key" ON "AddressVerification"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_providerWalletId_key" ON "Wallet"("providerWalletId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NinVerification" ADD CONSTRAINT "NinVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BvnVerification" ADD CONSTRAINT "BvnVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressVerification" ADD CONSTRAINT "AddressVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
