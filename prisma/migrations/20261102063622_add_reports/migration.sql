-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RatingCategory" AS ENUM ('R', 'K', 'C', 'B', 'T');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('LAYAK', 'BELUM_LAYAK', 'TIDAK_LAYAK');

-- AlterTable
ALTER TABLE "institution_participants" ADD COLUMN     "education" TEXT;

-- AlterTable
ALTER TABLE "psychologist_profiles" ADD COLUMN     "sippNumber" TEXT;

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "ratings" JSONB NOT NULL DEFAULT '{}',
    "narratives" JSONB NOT NULL DEFAULT '{}',
    "recommendation" "Recommendation",
    "filledById" UUID,
    "filledAt" TIMESTAMP(3),
    "number" TEXT,
    "seq" INTEGER,
    "year" INTEGER,
    "revision" INTEGER,
    "verifyCode" TEXT,
    "snapshot" JSONB,
    "issuedAt" TIMESTAMP(3),
    "issuedById" UUID,
    "supersedesId" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_number_key" ON "reports"("number");

-- CreateIndex
CREATE UNIQUE INDEX "reports_verifyCode_key" ON "reports"("verifyCode");

-- CreateIndex
CREATE UNIQUE INDEX "reports_supersedesId_key" ON "reports"("supersedesId");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_year_seq_idx" ON "reports"("year", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "reports_participantId_revision_key" ON "reports"("participantId", "revision");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "session_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one open draft and one valid document per participant. Prisma has no
-- partial-index syntax, so both are hand-written. They are the last line of
-- defence against a duplicate draft (two psychologists opening the form at the
-- same time) and a duplicate issue (two "Terbitkan" clicks racing).
CREATE UNIQUE INDEX "reports_one_draft_per_participant"
  ON "reports" ("participantId")
  WHERE "status" = 'DRAFT';

CREATE UNIQUE INDEX "reports_one_active_per_participant"
  ON "reports" ("participantId")
  WHERE "status" = 'ACTIVE';
