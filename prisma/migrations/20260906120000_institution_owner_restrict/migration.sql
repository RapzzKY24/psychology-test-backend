-- Align institutions.ownerUserId FK with schema.prisma onDelete: Restrict.
-- Deleting a user that owns an institution is now blocked instead of
-- silently detaching the row (previously ON DELETE SET NULL), which
-- produced unscopable institutions for T2 owner-scoping.
-- Note: enum value 'INSTANSI' needs no SQL here — added to the DB by
-- 20260906073000; this migration only syncs schema.prisma's UserRole enum.
ALTER TABLE "institutions" DROP CONSTRAINT "institutions_ownerUserId_fkey";
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
