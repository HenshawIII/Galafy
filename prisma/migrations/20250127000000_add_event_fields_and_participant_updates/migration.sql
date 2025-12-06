-- AlterTable
ALTER TABLE "Event" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Event" ADD COLUMN "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Event" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Event" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Event" ADD COLUMN "goLiveInstantly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "sprayGoal" DECIMAL(65,30);
ALTER TABLE "Event" ADD COLUMN "minSprayAmount" DECIMAL(65,30);
ALTER TABLE "Event" ALTER COLUMN "startsAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Event_hostUserId_idx" ON "Event"("hostUserId");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EventParticipant" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "EventParticipant_eventId_idx" ON "EventParticipant"("eventId");

-- CreateIndex
CREATE INDEX "EventParticipant_userId_role_idx" ON "EventParticipant"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_userId_key" ON "EventParticipant"("eventId", "userId");

