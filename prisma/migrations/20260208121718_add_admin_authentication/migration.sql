-- AlterEnum: Add FINANCE_ADMIN to AdminRole enum
ALTER TYPE "AdminRole" ADD VALUE 'FINANCE_ADMIN';

-- AlterTable: Make userId nullable in Admin table
ALTER TABLE "Admin" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable: Add email column to Admin table
ALTER TABLE "Admin" ADD COLUMN "email" TEXT;

-- AlterTable: Add password column to Admin table (nullable initially, then make required)
ALTER TABLE "Admin" ADD COLUMN "password" TEXT;

-- AlterTable: Add authentication tracking columns to Admin table
ALTER TABLE "Admin" ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- CreateIndex: Add unique constraint on email
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- Make password required (only if no existing records, otherwise this will fail)
-- If you have existing Admin records, you'll need to set passwords for them first
ALTER TABLE "Admin" ALTER COLUMN "password" SET NOT NULL;

