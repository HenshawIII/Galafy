-- Add DELETED to EventStatus (must be in its own migration; PG forbids using new enum values in the same transaction)
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'DELETED';
