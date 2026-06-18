-- Keep one bank account per customer (prefer isDefault, else most recent).
-- Re-point payout history to the retained account before deleting duplicates.

WITH keepers AS (
  SELECT DISTINCT ON ("customerId") id AS keeper_id, "customerId"
  FROM "BankAccount"
  ORDER BY "customerId", "isDefault" DESC, "updatedAt" DESC
)
UPDATE "PayoutTransaction" pt
SET "bankAccountId" = k.keeper_id
FROM "BankAccount" ba
INNER JOIN keepers k ON k."customerId" = ba."customerId"
WHERE pt."bankAccountId" = ba.id
  AND ba.id <> k.keeper_id;

DELETE FROM "BankAccount" ba
WHERE ba.id NOT IN (
  SELECT DISTINCT ON ("customerId") id
  FROM "BankAccount"
  ORDER BY "customerId", "isDefault" DESC, "updatedAt" DESC
);

CREATE UNIQUE INDEX "BankAccount_customerId_key" ON "BankAccount"("customerId");
