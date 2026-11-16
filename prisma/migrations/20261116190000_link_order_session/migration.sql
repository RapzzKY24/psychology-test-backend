-- AlterTable
ALTER TABLE "orders" ADD COLUMN "sessionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "orders_sessionId_key" ON "orders"("sessionId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: settlement used to leave the order id in the session title, so the
-- title is the only link the rows settled before this migration ever had.
UPDATE "orders" o
SET "sessionId" = s.id
FROM "test_sessions" s
WHERE s.title = 'Order ' || o.id::text
  AND o."sessionId" IS NULL;
