-- Default showOnLeaderboard to true (was false, which hid almost everyone as Anonymous).
-- Backfill existing rows: previous default meant "never opted in", not intentional opt-out.
ALTER TABLE "UserSettings" ALTER COLUMN "showOnLeaderboard" SET DEFAULT true;
UPDATE "UserSettings" SET "showOnLeaderboard" = true WHERE "showOnLeaderboard" = false;
