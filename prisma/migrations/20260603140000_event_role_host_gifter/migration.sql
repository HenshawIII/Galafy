-- Migrate EventRole from CELEBRANT/PERFORMER/ATTENDEE to HOST/GIFTER
-- (Postgres does not allow subqueries in ALTER COLUMN ... USING expressions.)

CREATE TYPE "EventRole_new" AS ENUM ('HOST', 'GIFTER');

ALTER TABLE "EventParticipant" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "EventParticipant" ADD COLUMN "role_new" "EventRole_new";

UPDATE "EventParticipant" AS ep
SET "role_new" = CASE
  WHEN ep."role"::text IN ('CELEBRANT', 'PERFORMER') AND ep."userId" = e."hostUserId"
  THEN 'HOST'::"EventRole_new"
  ELSE 'GIFTER'::"EventRole_new"
END
FROM "Event" AS e
WHERE e."id" = ep."eventId";

UPDATE "EventParticipant"
SET "role_new" = 'GIFTER'::"EventRole_new"
WHERE "role_new" IS NULL;

ALTER TABLE "EventParticipant" DROP COLUMN "role";
ALTER TABLE "EventParticipant" RENAME COLUMN "role_new" TO "role";
ALTER TABLE "EventParticipant" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "EventParticipant" ALTER COLUMN "role" SET DEFAULT 'GIFTER'::"EventRole_new";

DROP TYPE "EventRole";
ALTER TYPE "EventRole_new" RENAME TO "EventRole";

UPDATE "Event" SET "taggedPerformer" = NULL;

CREATE UNIQUE INDEX "EventParticipant_one_host_per_event"
  ON "EventParticipant" ("eventId")
  WHERE role = 'HOST';
