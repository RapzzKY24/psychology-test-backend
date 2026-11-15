-- ADR-011's generic norm table. 16PF is the first instrument that needs it:
-- seventeen factors, each converted raw -> sten, under nine norm groups.
CREATE TABLE "norm_tables" (
    "id" TEXT NOT NULL,
    "testId" UUID NOT NULL,
    "group" TEXT NOT NULL DEFAULT '',
    "scale" TEXT,
    "rawMin" INTEGER NOT NULL,
    "rawMax" INTEGER NOT NULL,
    "outputValue" INTEGER NOT NULL,
    "outputLabel" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "norm_tables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "norm_tables_testId_group_scale_rawMin_key" ON "norm_tables"("testId", "group", "scale", "rawMin");

CREATE INDEX "norm_tables_testId_idx" ON "norm_tables"("testId");

ALTER TABLE "norm_tables" ADD CONSTRAINT "norm_tables_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
