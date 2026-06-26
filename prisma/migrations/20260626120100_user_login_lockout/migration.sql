-- Backfill soft-deleted events (separate migration from enum ADD VALUE — PostgreSQL requirement)
UPDATE "Event"
SET status = 'DELETED'
WHERE "deletedAt" IS NOT NULL
  AND status::text <> 'DELETED';

-- User credential login lockout (mirrors Admin model)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
