-- CreateIndex: Add index on username for user search performance
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");

-- CreateIndex: Add index on title for event search performance
CREATE INDEX IF NOT EXISTS "Event_title_idx" ON "Event"("title");

-- CreateIndex: Add index on location for event location filter
CREATE INDEX IF NOT EXISTS "Event_location_idx" ON "Event"("location");

-- CreateIndex: Add index on startsAt for event date/time filter
CREATE INDEX IF NOT EXISTS "Event_startsAt_idx" ON "Event"("startsAt");
