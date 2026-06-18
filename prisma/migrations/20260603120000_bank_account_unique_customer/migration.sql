-- Keep one bank account per customer (prefer isDefault, else most recent).
DELETE FROM "BankAccount" ba
WHERE ba.id NOT IN (
  SELECT DISTINCT ON ("customerId") id
  FROM "BankAccount"
  ORDER BY "customerId", "isDefault" DESC, "updatedAt" DESC
);

CREATE UNIQUE INDEX "BankAccount_customerId_key" ON "BankAccount"("customerId");
