-- Add session version to support immediate access token invalidation across devices
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authSessionVersion" INTEGER NOT NULL DEFAULT 0;

