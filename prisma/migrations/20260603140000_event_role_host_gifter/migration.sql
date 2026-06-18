-- Migrate EventRole from CELEBRANT/PERFORMER/ATTENDEE to HOST/GIFTER

CREATE TYPE "EventRole_new" AS ENUM ('HOST', 'GIFTER');

ALTER TABLE "EventParticipant" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "EventParticipant"
  ALTER COLUMN "role" TYPE "EventRole_new"
  USING (
    CASE
      WHEN "role"::text IN ('CELEBRANT', 'PERFORMER')
        AND "userId" = (SELECT "hostUserId" FROM "Event" e WHERE e."id" = "EventParticipant"."eventId")
      THEN 'HOST'::"EventRole_new"
      ELSE 'GIFTER'::"EventRole_new"
    END
  );

ALTER TABLE "EventParticipant" ALTER COLUMN "role" SET DEFAULT 'GIFTER'::"EventRole_new";

DROP TYPE "EventRole";

ALTER TYPE "EventRole_new" RENAME TO "EventRole";

UPDATE "Event" SET "taggedPerformer" = NULL;

CREATE UNIQUE INDEX "EventParticipant_one_host_per_event"
  ON "EventParticipant" ("eventId")
  WHERE role = 'HOST';
