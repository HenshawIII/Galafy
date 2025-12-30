-- CreateTable
CREATE TABLE "WalletCreationEvent" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deviceToken" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "browserFingerprint" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "deviceWalletCount" INTEGER,
    "ipWalletCount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletCreationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletCreationEvent_deviceToken_idx" ON "WalletCreationEvent"("deviceToken");

-- CreateIndex
CREATE INDEX "WalletCreationEvent_ipAddress_idx" ON "WalletCreationEvent"("ipAddress");

-- CreateIndex
CREATE INDEX "WalletCreationEvent_userId_idx" ON "WalletCreationEvent"("userId");

-- CreateIndex
CREATE INDEX "WalletCreationEvent_walletId_idx" ON "WalletCreationEvent"("walletId");

-- CreateIndex
CREATE INDEX "WalletCreationEvent_isFlagged_idx" ON "WalletCreationEvent"("isFlagged");

-- CreateIndex
CREATE INDEX "WalletCreationEvent_createdAt_idx" ON "WalletCreationEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "WalletCreationEvent" ADD CONSTRAINT "WalletCreationEvent_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletCreationEvent" ADD CONSTRAINT "WalletCreationEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NotificationDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

