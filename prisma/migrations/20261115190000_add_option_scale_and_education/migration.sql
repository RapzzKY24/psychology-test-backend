-- 16PF shows three text options per item and scores them on a per-factor scale,
-- which LIKERT cannot express (its answer is a numeric rating). The sten table
-- is also picked by schooling, so an attempt has to declare one.
ALTER TYPE "ScorerType" ADD VALUE 'OPTION_SCALE';

-- CreateEnum
CREATE TYPE "Education" AS ENUM ('SMP_SMA', 'S1', 'UMUM');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN "education" "Education";

-- AlterTable
ALTER TABLE "tests" ADD COLUMN "requiresEducation" BOOLEAN NOT NULL DEFAULT false;
