-- AlterTable: Add refreshToken field to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;

-- CreateIndex: Create unique index on refreshToken (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS "User_refreshToken_key" ON "User"("refreshToken") WHERE "refreshToken" IS NOT NULL;

-- AlterTable: Add refreshTokenExpiresAt field to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);

