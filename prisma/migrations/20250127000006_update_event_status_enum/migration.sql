-- Update EventStatus enum to match schema
-- Step 1: Temporarily convert column to text
ALTER TABLE "Event" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

-- Step 2: Drop the old enum
DROP TYPE "EventStatus";

-- Step 3: Create the new enum with correct values
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- Step 4: Convert existing data and change column back to enum
-- Map ACTIVE -> LIVE (closest equivalent)
ALTER TABLE "Event" ALTER COLUMN "status" TYPE "EventStatus" USING 
  CASE 
    WHEN "status" = 'DRAFT' THEN 'DRAFT'::"EventStatus"
    WHEN "status" = 'ACTIVE' THEN 'LIVE'::"EventStatus"
    WHEN "status" = 'ENDED' THEN 'ENDED'::"EventStatus"
    WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"EventStatus"
    ELSE 'DRAFT'::"EventStatus"
  END;

-- Step 5: Restore the default
ALTER TABLE "Event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

