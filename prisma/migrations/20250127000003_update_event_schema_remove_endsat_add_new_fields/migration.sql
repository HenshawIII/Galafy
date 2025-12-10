-- AlterTable
ALTER TABLE "Event" DROP COLUMN "endsAt";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "enableLeaderboard" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "anonSprayersAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "taggedPerformer" TEXT;

