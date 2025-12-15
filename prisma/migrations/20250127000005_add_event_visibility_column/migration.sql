-- CreateEnum (only if it doesn't exist)
DO $$ BEGIN
    CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable (only if column doesn't exist)
DO $$ BEGIN
    ALTER TABLE "Event" ADD COLUMN "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

