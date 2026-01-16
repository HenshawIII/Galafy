-- AlterTable
ALTER TABLE "Event" ADD COLUMN "endsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_status_endsAt_idx" ON "Event"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Event_endsAt_idx" ON "Event"("endsAt");

