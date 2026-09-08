-- AlterTable
ALTER TABLE "session_participants" ADD COLUMN     "institutionParticipantId" UUID;

-- CreateIndex
CREATE INDEX "session_participants_institutionParticipantId_idx" ON "session_participants"("institutionParticipantId");

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_institutionParticipantId_fkey" FOREIGN KEY ("institutionParticipantId") REFERENCES "institution_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
