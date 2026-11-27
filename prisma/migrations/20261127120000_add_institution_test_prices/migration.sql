-- Negotiated per-institution price for one test. Absent row = list price.

-- CreateTable
CREATE TABLE "institution_test_prices" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_test_prices_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "session_tests" ADD COLUMN "unitPrice" INTEGER;

-- CreateIndex
CREATE INDEX "institution_test_prices_institutionId_idx" ON "institution_test_prices"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_test_prices_institutionId_testId_key" ON "institution_test_prices"("institutionId", "testId");

-- AddForeignKey
ALTER TABLE "institution_test_prices" ADD CONSTRAINT "institution_test_prices_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_test_prices" ADD CONSTRAINT "institution_test_prices_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
