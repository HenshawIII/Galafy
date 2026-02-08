-- CreateEnum: AlertStatus
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateTable: AmlAlert
CREATE TABLE "AmlAlert" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "walletId" TEXT,
    "transactionId" TEXT,
    "sprayId" TEXT,
    "customerId" TEXT,
    "userId" TEXT,
    "eventId" TEXT,
    "details" JSONB NOT NULL,
    "context" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmlAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: AmlAlert indexes
CREATE INDEX "AmlAlert_status_idx" ON "AmlAlert"("status");
CREATE INDEX "AmlAlert_severity_idx" ON "AmlAlert"("severity");
CREATE INDEX "AmlAlert_eventType_idx" ON "AmlAlert"("eventType");
CREATE INDEX "AmlAlert_createdAt_idx" ON "AmlAlert"("createdAt");
CREATE INDEX "AmlAlert_walletId_idx" ON "AmlAlert"("walletId");
CREATE INDEX "AmlAlert_customerId_idx" ON "AmlAlert"("customerId");
CREATE INDEX "AmlAlert_reviewedBy_idx" ON "AmlAlert"("reviewedBy");

-- AddForeignKey: AmlAlert -> Wallet
ALTER TABLE "AmlAlert" ADD CONSTRAINT "AmlAlert_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

