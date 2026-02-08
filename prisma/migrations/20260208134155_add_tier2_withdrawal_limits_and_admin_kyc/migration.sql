-- CreateEnum: UtilityBillStatus
CREATE TYPE "UtilityBillStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: UtilityBillSubmission
CREATE TABLE "UtilityBillSubmission" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "utilityBillUrl" TEXT NOT NULL,
    "status" "UtilityBillStatus" NOT NULL DEFAULT 'PENDING',
    "adminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityBillSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WithdrawalLimit
CREATE TABLE "WithdrawalLimit" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dailyLimit" DECIMAL(19,2) NOT NULL DEFAULT 100000000,
    "approvedDailyLimit" DECIMAL(19,2),
    "lastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailyWithdrawn" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "isLimitIncreased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AdminActionLog
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Customer - Add AML restriction fields
ALTER TABLE "Customer" ADD COLUMN "isAmlRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "amlRestrictedAt" TIMESTAMP(3),
ADD COLUMN "amlRestrictionReason" TEXT;

-- CreateIndex: UtilityBillSubmission indexes
CREATE INDEX "UtilityBillSubmission_customerId_idx" ON "UtilityBillSubmission"("customerId");
CREATE INDEX "UtilityBillSubmission_status_idx" ON "UtilityBillSubmission"("status");
CREATE INDEX "UtilityBillSubmission_adminId_idx" ON "UtilityBillSubmission"("adminId");

-- CreateIndex: WithdrawalLimit index
CREATE INDEX "WithdrawalLimit_customerId_idx" ON "WithdrawalLimit"("customerId");

-- CreateIndex: AdminActionLog indexes
CREATE INDEX "AdminActionLog_adminId_idx" ON "AdminActionLog"("adminId");
CREATE INDEX "AdminActionLog_actionType_idx" ON "AdminActionLog"("actionType");
CREATE INDEX "AdminActionLog_targetType_targetId_idx" ON "AdminActionLog"("targetType", "targetId");
CREATE INDEX "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");

-- CreateUniqueConstraint: WithdrawalLimit customerId
CREATE UNIQUE INDEX "WithdrawalLimit_customerId_key" ON "WithdrawalLimit"("customerId");

-- AddForeignKey: UtilityBillSubmission -> Customer
ALTER TABLE "UtilityBillSubmission" ADD CONSTRAINT "UtilityBillSubmission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: UtilityBillSubmission -> Admin
ALTER TABLE "UtilityBillSubmission" ADD CONSTRAINT "UtilityBillSubmission_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: WithdrawalLimit -> Customer
ALTER TABLE "WithdrawalLimit" ADD CONSTRAINT "WithdrawalLimit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: AdminActionLog -> Admin
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

