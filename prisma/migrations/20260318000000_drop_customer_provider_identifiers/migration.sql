-- Drop unused provider-side identifier columns from Customer
-- Data loss: removing organizationId, customerTypeId, and countryId

ALTER TABLE "Customer" DROP COLUMN IF EXISTS "organizationId";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "customerTypeId";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "countryId";

