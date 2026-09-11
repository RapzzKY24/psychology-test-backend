-- AlterTable
ALTER TABLE "psychologist_profiles" ADD COLUMN "nik" TEXT,
ADD COLUMN "institutionName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "psychologist_profiles_nik_key" ON "psychologist_profiles"("nik");
