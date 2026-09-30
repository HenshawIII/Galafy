-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "publicLeaderboardEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicLeaderboardToken" TEXT,
ADD COLUMN     "publicLeaderboardShowAmounts" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Event_publicLeaderboardToken_key" ON "Event"("publicLeaderboardToken");
