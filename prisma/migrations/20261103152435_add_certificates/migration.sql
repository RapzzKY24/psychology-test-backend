-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CertificateVerdict" AS ENUM ('MEMENUHI_SYARAT', 'TIDAK_MEMENUHI_SYARAT');

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "resultId" UUID NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'DRAFT',
    "identity" JSONB NOT NULL DEFAULT '{}',
    "verdict" "CertificateVerdict",
    "purpose" TEXT,
    "validUntil" TIMESTAMP(3),
    "photoPath" TEXT,
    "filledById" TEXT,
    "filledAt" TIMESTAMP(3),
    "number" TEXT,
    "seq" INTEGER,
    "year" INTEGER,
    "revision" INTEGER,
    "verifyCode" TEXT,
    "snapshot" JSONB,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "supersedesId" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verifyCode_key" ON "certificates"("verifyCode");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_supersedesId_key" ON "certificates"("supersedesId");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "certificates_year_seq_idx" ON "certificates"("year", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_resultId_revision_key" ON "certificates"("resultId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_number_revision_key" ON "certificates"("number", "revision");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "test_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
