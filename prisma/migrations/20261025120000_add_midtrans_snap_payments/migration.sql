-- AlterEnum
ALTER TYPE "EventSource" ADD VALUE 'MIDTRANS';

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'MIDTRANS_SNAP';

-- AlterEnum
ALTER TYPE "PaymentVerifiedBySource" ADD VALUE 'MIDTRANS';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paymentToken" TEXT,
ADD COLUMN     "paymentType" TEXT,
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "providerOrderId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentToken" TEXT,
ADD COLUMN     "paymentType" TEXT,
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "providerOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_providerOrderId_key" ON "invoices"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_providerOrderId_key" ON "orders"("providerOrderId");
