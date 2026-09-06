-- CreateEnum
CREATE TYPE "JoinMode" AS ENUM ('OPEN', 'ROSTER');

-- AlterTable
ALTER TABLE "session_participants" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "tokenHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "test_sessions" ADD COLUMN     "joinMode" "JoinMode" NOT NULL DEFAULT 'OPEN';
