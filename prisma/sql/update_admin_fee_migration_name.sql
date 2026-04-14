-- One-time fix after renaming migration folder 20250129000000_add_admin_fee_table → 20251125140000_add_admin_fee_table.
-- Run only on databases that already have a row for the OLD name (otherwise skip).
-- Recompute checksum if you change migration.sql: sha256 of file contents (Prisma stores hex, no prefix).

UPDATE "_prisma_migrations"
SET
  "migration_name" = '20251125140000_add_admin_fee_table',
  "checksum" = '7e5fb1e8200d206a0dfc48b1c62a2f885eb0bc6d552648a96b9c8542aa4e7f51'
WHERE "migration_name" = '20250129000000_add_admin_fee_table';
