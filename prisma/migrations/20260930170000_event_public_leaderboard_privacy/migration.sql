-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "publicLeaderboardShowNames" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicLeaderboardShowTotalAmount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicLeaderboardShowParticipantCount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicLeaderboardAllowAnonymous" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicLeaderboardTopN" INTEGER;
