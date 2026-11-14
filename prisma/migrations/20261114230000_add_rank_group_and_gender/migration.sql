-- AlterEnum
ALTER TYPE "ScorerType" ADD VALUE 'RANK_GROUP';

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN "gender" "Gender";

-- AlterTable
ALTER TABLE "tests" ADD COLUMN "requiresGender" BOOLEAN NOT NULL DEFAULT false;
