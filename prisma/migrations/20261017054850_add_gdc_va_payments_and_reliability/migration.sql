-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL_QRIS', 'GDC_VA');

-- CreateEnum
CREATE TYPE "PaymentVerifiedBySource" AS ENUM ('ADMIN', 'GDC');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('GDC', 'MANUAL');

-- CreateEnum
CREATE TYPE "EventDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "gdcExternalId" TEXT,
ADD COLUMN     "gdcReferenceNo" TEXT,
ADD COLUMN     "gdcTrxId" TEXT,
ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "vaBankCode" TEXT,
ADD COLUMN     "vaNumber" TEXT,
ADD COLUMN     "verifiedBySource" "PaymentVerifiedBySource";

-- CreateTable
CREATE TABLE "event_log" (
    "id" UUID NOT NULL,
    "source" "EventSource" NOT NULL,
    "direction" "EventDirection" NOT NULL,
    "type" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'RECEIVED',
    "aggregateType" TEXT,
    "aggregateId" UUID,
    "reference" TEXT,
    "idempotencyKey" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "httpStatus" INTEGER,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "lockedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_log_aggregateType_aggregateId_idx" ON "event_log"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "event_log_status_createdAt_idx" ON "event_log"("status", "createdAt");

-- CreateIndex
CREATE INDEX "event_log_idempotencyKey_idx" ON "event_log"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_scope_createdAt_idx" ON "idempotency_keys"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "orders_vaNumber_idx" ON "orders"("vaNumber");

-- AddForeignKey
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_aggregateId_fkey" FOREIGN KEY ("aggregateId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
