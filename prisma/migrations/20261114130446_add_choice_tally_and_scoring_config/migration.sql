-- AlterEnum
ALTER TYPE "ScorerType" ADD VALUE 'CHOICE_TALLY';

-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "scoringConfig" JSONB;
