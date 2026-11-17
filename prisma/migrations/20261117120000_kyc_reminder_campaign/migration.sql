-- CreateEnum
CREATE TYPE "KycReminderCampaignStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "KycReminderCampaign" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetTier" "KycTier" NOT NULL,
    "messageKey" TEXT NOT NULL,
    "messageTitle" TEXT NOT NULL,
    "messageSnippet" TEXT NOT NULL,
    "channelEmail" BOOLEAN NOT NULL,
    "channelInApp" BOOLEAN NOT NULL,
    "status" "KycReminderCampaignStatus" NOT NULL DEFAULT 'PROCESSING',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailSentCount" INTEGER NOT NULL DEFAULT 0,
    "inAppSentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycReminderCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KycReminderCampaign_createdAt_idx" ON "KycReminderCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "KycReminderCampaign_status_idx" ON "KycReminderCampaign"("status");

-- CreateIndex
CREATE INDEX "KycReminderCampaign_targetTier_idx" ON "KycReminderCampaign"("targetTier");

-- CreateIndex
CREATE INDEX "KycReminderCampaign_adminId_idx" ON "KycReminderCampaign"("adminId");

-- AddForeignKey
ALTER TABLE "KycReminderCampaign" ADD CONSTRAINT "KycReminderCampaign_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
