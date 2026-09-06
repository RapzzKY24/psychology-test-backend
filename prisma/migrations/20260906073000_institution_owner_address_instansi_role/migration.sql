-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'INSTANSI';

-- AlterTable
ALTER TABLE "institutions" ADD COLUMN     "address" TEXT,
ADD COLUMN     "ownerUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "institutions_ownerUserId_key" ON "institutions"("ownerUserId");

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
