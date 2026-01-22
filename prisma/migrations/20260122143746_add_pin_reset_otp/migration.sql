-- AlterTable
ALTER TABLE "User" ADD COLUMN "pinResetOtp" TEXT;
ALTER TABLE "User" ADD COLUMN "pinResetOtpExpiresAt" TIMESTAMP(3);

