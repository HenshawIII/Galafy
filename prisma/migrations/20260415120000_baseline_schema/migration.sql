-- Baseline: full schema from prisma/schema.prisma (replaces all prior migration history).
-- New environments: empty DB + `prisma migrate deploy` applies this file once.

-- CreateEnum
CREATE TYPE "KycTier" AS ENUM ('Tier_0', 'Tier_1', 'Tier_2', 'Tier_3');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INFLOW', 'SPRAY', 'PAYOUT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "FundingChannel" AS ENUM ('BANK_TRANSFER', 'CARD', 'USSD', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "EventRole" AS ENUM ('ATTENDEE', 'PERFORMER', 'CELEBRANT');

-- CreateEnum
CREATE TYPE "SprayStatus" AS ENUM ('PENDING_PROVIDER', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATIONS', 'COMPLIANCE', 'SUPPORT', 'FINANCE_ADMIN', 'VIEW_ONLY');

-- CreateEnum
CREATE TYPE "KycRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UtilityBillStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ConfigType" AS ENUM ('STRING', 'NUMBER', 'DECIMAL', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "Tier1FaceStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "profilePicture" TEXT,
    "password" TEXT,
    "phone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationCode" TEXT,
    "passwordResetOtp" TEXT,
    "refreshToken" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "authSessionVersion" INTEGER NOT NULL DEFAULT 0,
    "payoutPin" TEXT,
    "payoutOtp" TEXT,
    "payoutOtpExpiresAt" TIMESTAMP(3),
    "pinResetOtp" TEXT,
    "pinResetOtpExpiresAt" TIMESTAMP(3),
    "pendingPayoutData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "showOnLeaderboard" BOOLEAN NOT NULL DEFAULT false,
    "allowMentionsOrTags" BOOLEAN NOT NULL DEFAULT true,
    "showOnlineStatus" BOOLEAN NOT NULL DEFAULT false,
    "visibleAtEvents" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "eventReminders" BOOLEAN NOT NULL DEFAULT true,
    "leaderboardUpdates" BOOLEAN NOT NULL DEFAULT false,
    "newFollowerAlerts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "appVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "tier" "KycTier" NOT NULL DEFAULT 'Tier_0',
    "providerTierCode" INTEGER NOT NULL DEFAULT 0,
    "tier1CorrelationId" TEXT,
    "tier1PendingBvn" TEXT,
    "tier1TrackingId" TEXT,
    "tier1FaceStatus" "Tier1FaceStatus",
    "tier1CompletedAt" TIMESTAMP(3),
    "tier1AccountStatus" TEXT,
    "tier1Nuban" TEXT,
    "tier1NubanName" TEXT,
    "tier1AccountCompletedAt" TIMESTAMP(3),
    "tier2TrackingId" TEXT,
    "tier2AddressVerificationStatus" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "middleName" TEXT,
    "dob" TIMESTAMP(3),
    "city" TEXT,
    "address" TEXT,
    "mobileNumber" TEXT,
    "emailAddress" TEXT,
    "isCorporateVerified" BOOLEAN,
    "providerDateCreated" TIMESTAMP(3),
    "isAmlRestricted" BOOLEAN NOT NULL DEFAULT false,
    "amlRestrictedAt" TIMESTAMP(3),
    "amlRestrictionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NinVerification" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerCheckId" INTEGER,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NinVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BvnVerification" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerCheckId" INTEGER,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BvnVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressVerification" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "providerStatus" TEXT,
    "providerMessage" TEXT,
    "residentialAddressJson" JSONB,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerWalletId" TEXT,
    "walletGroupId" TEXT,
    "walletRestrictionId" TEXT,
    "walletClassificationId" TEXT,
    "currencyId" TEXT NOT NULL,
    "availableBalance" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "ledgerBalance" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "overdraft" DECIMAL(19,2) DEFAULT 0,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "mobNum" TEXT,
    "virtualAccountNumber" TEXT,
    "virtualBankCode" TEXT,
    "virtualBankName" TEXT,
    "riskScore" DECIMAL(5,2),
    "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "riskScoreUpdatedAt" TIMESTAMP(3),
    "riskMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(19,2) NOT NULL,
    "currencyId" TEXT NOT NULL,
    "groupReference" TEXT,
    "reference" TEXT NOT NULL,
    "externalReference" TEXT,
    "narration" TEXT,
    "metadata" JSONB,
    "securityInfoHash" TEXT,
    "providerPlatformTransactionReference" TEXT,
    "providerTransactionStan" TEXT,
    "providerOriginalTransactionDate" TIMESTAMP(3),
    "providerStatus" TEXT,
    "providerCallbackReceivedAt" TIMESTAMP(3),
    "destinationAccountNumber" TEXT,
    "destinationAccountName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "imagePath" TEXT,
    "goLiveInstantly" BOOLEAN NOT NULL DEFAULT false,
    "sprayGoal" DECIMAL(19,2),
    "minSprayAmount" DECIMAL(19,2),
    "enableLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "anonSprayersAllowed" BOOLEAN NOT NULL DEFAULT true,
    "taggedPerformer" TEXT,
    "hostUserId" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT,
    "role" "EventRole" NOT NULL DEFAULT 'ATTENDEE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spray" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "sprayerWalletId" TEXT NOT NULL,
    "receiverWalletId" TEXT NOT NULL,
    "transactionId" TEXT,
    "transactionGroupReference" TEXT,
    "totalAmount" DECIMAL(19,2) NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "status" "SprayStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Spray_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "providerRecipientCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "fee" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "channel" "FundingChannel" NOT NULL,
    "status" "FundingStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT NOT NULL,
    "providerReference" TEXT,
    "providerPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "fee" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT NOT NULL,
    "providerTransactionRef" TEXT,
    "providerPayload" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalReason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminFee" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "feeType" TEXT NOT NULL,
    "feePercentage" DECIMAL(5,4),
    "relatedTransactionId" TEXT,
    "fundingTransactionId" TEXT,
    "payoutTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COLLECTED',
    "grossAmount" DECIMAL(19,2),
    "netAmount" DECIMAL(19,2),
    "adminWalletAccountNumber" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "paymentReference" TEXT,
    "payload" JSONB NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "userId" TEXT,
    "role" "AdminRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestedTier" "KycTier" NOT NULL,
    "status" "KycRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminId" TEXT,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycRequest_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "UtilityBillSubmission" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "utilityBillUrl" TEXT NOT NULL,
    "status" "UtilityBillStatus" NOT NULL DEFAULT 'PENDING',
    "adminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityBillSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalLimit" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dailyLimit" DECIMAL(19,2) NOT NULL DEFAULT 100000000000,
    "approvedDailyLimit" DECIMAL(19,2),
    "lastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailyWithdrawn" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "isLimitIncreased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "ConfigType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_refreshToken_key" ON "User"("refreshToken");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDevice_deviceToken_key" ON "NotificationDevice"("deviceToken");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_providerCustomerId_key" ON "Customer"("providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tier1CorrelationId_key" ON "Customer"("tier1CorrelationId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tier1PendingBvn_key" ON "Customer"("tier1PendingBvn");

-- CreateIndex
CREATE UNIQUE INDEX "NinVerification_customerId_key" ON "NinVerification"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BvnVerification_customerId_key" ON "BvnVerification"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AddressVerification_customerId_key" ON "AddressVerification"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_providerWalletId_key" ON "Wallet"("providerWalletId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_providerPlatformTransactionReference_key" ON "Transaction"("providerPlatformTransactionReference");

-- CreateIndex
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");

-- CreateIndex
CREATE INDEX "Event_hostUserId_idx" ON "Event"("hostUserId");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_status_endsAt_idx" ON "Event"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Event_title_idx" ON "Event"("title");

-- CreateIndex
CREATE INDEX "Event_location_idx" ON "Event"("location");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE INDEX "Event_endsAt_idx" ON "Event"("endsAt");

-- CreateIndex
CREATE INDEX "EventParticipant_eventId_idx" ON "EventParticipant"("eventId");

-- CreateIndex
CREATE INDEX "EventParticipant_userId_role_idx" ON "EventParticipant"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_userId_key" ON "EventParticipant"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Spray_transactionId_key" ON "Spray"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Spray_transactionGroupReference_key" ON "Spray"("transactionGroupReference");

-- CreateIndex
CREATE UNIQUE INDEX "FundingTransaction_transactionId_key" ON "FundingTransaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingTransaction_providerReference_key" ON "FundingTransaction"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutTransaction_transactionId_key" ON "PayoutTransaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutTransaction_providerTransactionRef_key" ON "PayoutTransaction"("providerTransactionRef");

-- CreateIndex
CREATE INDEX "PayoutTransaction_providerTransactionRef_idx" ON "PayoutTransaction"("providerTransactionRef");

-- CreateIndex
CREATE INDEX "PayoutTransaction_requiresApproval_status_idx" ON "PayoutTransaction"("requiresApproval", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminFee_fundingTransactionId_key" ON "AdminFee"("fundingTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminFee_payoutTransactionId_key" ON "AdminFee"("payoutTransactionId");

-- CreateIndex
CREATE INDEX "AdminFee_walletId_idx" ON "AdminFee"("walletId");

-- CreateIndex
CREATE INDEX "AdminFee_customerId_idx" ON "AdminFee"("customerId");

-- CreateIndex
CREATE INDEX "AdminFee_feeType_idx" ON "AdminFee"("feeType");

-- CreateIndex
CREATE INDEX "AdminFee_relatedTransactionId_idx" ON "AdminFee"("relatedTransactionId");

-- CreateIndex
CREATE INDEX "AdminFee_createdAt_idx" ON "AdminFee"("createdAt");

-- CreateIndex
CREATE INDEX "AdminFee_status_idx" ON "AdminFee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_userId_key" ON "Admin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_passwordResetToken_key" ON "Admin"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvite_email_key" ON "AdminInvite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvite_token_key" ON "AdminInvite"("token");

-- CreateIndex
CREATE INDEX "AdminInvite_token_idx" ON "AdminInvite"("token");

-- CreateIndex
CREATE INDEX "AdminInvite_email_idx" ON "AdminInvite"("email");

-- CreateIndex
CREATE INDEX "AdminInvite_invitedBy_idx" ON "AdminInvite"("invitedBy");

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

-- CreateIndex
CREATE INDEX "UtilityBillSubmission_customerId_idx" ON "UtilityBillSubmission"("customerId");

-- CreateIndex
CREATE INDEX "UtilityBillSubmission_status_idx" ON "UtilityBillSubmission"("status");

-- CreateIndex
CREATE INDEX "UtilityBillSubmission_adminId_idx" ON "UtilityBillSubmission"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalLimit_customerId_key" ON "WithdrawalLimit"("customerId");

-- CreateIndex
CREATE INDEX "WithdrawalLimit_customerId_idx" ON "WithdrawalLimit"("customerId");

-- CreateIndex
CREATE INDEX "AdminActionLog_adminId_idx" ON "AdminActionLog"("adminId");

-- CreateIndex
CREATE INDEX "AdminActionLog_actionType_idx" ON "AdminActionLog"("actionType");

-- CreateIndex
CREATE INDEX "AdminActionLog_targetType_targetId_idx" ON "AdminActionLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");

-- CreateIndex
CREATE INDEX "AmlAlert_status_idx" ON "AmlAlert"("status");

-- CreateIndex
CREATE INDEX "AmlAlert_severity_idx" ON "AmlAlert"("severity");

-- CreateIndex
CREATE INDEX "AmlAlert_eventType_idx" ON "AmlAlert"("eventType");

-- CreateIndex
CREATE INDEX "AmlAlert_createdAt_idx" ON "AmlAlert"("createdAt");

-- CreateIndex
CREATE INDEX "AmlAlert_walletId_idx" ON "AmlAlert"("walletId");

-- CreateIndex
CREATE INDEX "AmlAlert_customerId_idx" ON "AmlAlert"("customerId");

-- CreateIndex
CREATE INDEX "AmlAlert_reviewedBy_idx" ON "AmlAlert"("reviewedBy");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_category_idx" ON "SystemConfig"("category");

-- CreateIndex
CREATE INDEX "SystemConfig_isActive_idx" ON "SystemConfig"("isActive");

-- CreateIndex
CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDevice" ADD CONSTRAINT "NotificationDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NinVerification" ADD CONSTRAINT "NinVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BvnVerification" ADD CONSTRAINT "BvnVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressVerification" ADD CONSTRAINT "AddressVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spray" ADD CONSTRAINT "Spray_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spray" ADD CONSTRAINT "Spray_sprayerWalletId_fkey" FOREIGN KEY ("sprayerWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spray" ADD CONSTRAINT "Spray_receiverWalletId_fkey" FOREIGN KEY ("receiverWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spray" ADD CONSTRAINT "Spray_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingTransaction" ADD CONSTRAINT "FundingTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingTransaction" ADD CONSTRAINT "FundingTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_fundingTransactionId_fkey" FOREIGN KEY ("fundingTransactionId") REFERENCES "FundingTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFee" ADD CONSTRAINT "AdminFee_payoutTransactionId_fkey" FOREIGN KEY ("payoutTransactionId") REFERENCES "PayoutTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletCreationEvent" ADD CONSTRAINT "WalletCreationEvent_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletCreationEvent" ADD CONSTRAINT "WalletCreationEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NotificationDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityBillSubmission" ADD CONSTRAINT "UtilityBillSubmission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityBillSubmission" ADD CONSTRAINT "UtilityBillSubmission_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalLimit" ADD CONSTRAINT "WithdrawalLimit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlAlert" ADD CONSTRAINT "AmlAlert_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
