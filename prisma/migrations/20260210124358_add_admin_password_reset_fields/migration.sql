-- AlterTable: Add password reset fields to Admin
ALTER TABLE "Admin" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "Admin" ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex: Admin password reset token unique constraint
CREATE UNIQUE INDEX "Admin_passwordResetToken_key" ON "Admin"("passwordResetToken");

