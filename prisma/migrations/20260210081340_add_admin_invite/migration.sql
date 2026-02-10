-- CreateTable: AdminInvite
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: AdminInvite unique constraints
CREATE UNIQUE INDEX "AdminInvite_email_key" ON "AdminInvite"("email");
CREATE UNIQUE INDEX "AdminInvite_token_key" ON "AdminInvite"("token");

-- CreateIndex: AdminInvite indexes
CREATE INDEX "AdminInvite_token_idx" ON "AdminInvite"("token");
CREATE INDEX "AdminInvite_email_idx" ON "AdminInvite"("email");
CREATE INDEX "AdminInvite_invitedBy_idx" ON "AdminInvite"("invitedBy");

-- AddForeignKey: AdminInvite.inviter -> Admin.id
ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

