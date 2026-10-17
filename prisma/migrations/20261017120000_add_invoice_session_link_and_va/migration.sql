-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "gdcExternalId" TEXT,
ADD COLUMN     "gdcReferenceNo" TEXT,
ADD COLUMN     "gdcTrxId" TEXT,
ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "sessionId" UUID,
ADD COLUMN     "vaBankCode" TEXT,
ADD COLUMN     "vaNumber" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBySource" "PaymentVerifiedBySource";

-- CreateIndex
CREATE UNIQUE INDEX "invoices_sessionId_key" ON "invoices"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_vaNumber_key" ON "invoices"("vaNumber");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
