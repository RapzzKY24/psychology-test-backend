-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('NIK', 'PASPOR');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'PSYCHOLOGIST', 'PARTICIPANT');
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

-- CreateTable
CREATE TABLE "institution_participants" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "idType" "IdType" NOT NULL,
    "idNumber" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_participants_institutionId_idx" ON "institution_participants"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_participants_institutionId_idNumber_key" ON "institution_participants"("institutionId", "idNumber");

-- AddForeignKey
ALTER TABLE "institution_participants" ADD CONSTRAINT "institution_participants_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
