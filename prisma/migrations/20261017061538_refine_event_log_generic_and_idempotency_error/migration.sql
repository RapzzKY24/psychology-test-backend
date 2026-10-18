-- DropForeignKey
ALTER TABLE "event_log" DROP CONSTRAINT "event_log_aggregateId_fkey";

-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN     "errorMessage" TEXT;
