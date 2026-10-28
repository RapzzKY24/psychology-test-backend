-- AlterTable
ALTER TABLE "attempts" ALTER COLUMN "userId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "userId" SET DATA TYPE TEXT,
ALTER COLUMN "verifiedById" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "psychologist_profiles" ALTER COLUMN "userId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "test_results" ALTER COLUMN "correctedById" SET DATA TYPE TEXT,
ALTER COLUMN "reviewedById" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "test_sessions" ALTER COLUMN "createdById" SET DATA TYPE TEXT;
