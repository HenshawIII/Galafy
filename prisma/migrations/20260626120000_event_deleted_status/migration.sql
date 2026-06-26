-- Add DELETED to EventStatus and backfill rows already soft-deleted
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'DELETED';

UPDATE "Event"
SET status = 'DELETED'
WHERE "deletedAt" IS NOT NULL
  AND status::text <> 'DELETED';
