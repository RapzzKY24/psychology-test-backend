-- Restore enum value 'INSTANSI', removed by 20260906080000's UserRole
-- table rebuild. 073000 added it; 080000 recreated the type without it.
-- (User.role is a plain String column so runtime was unaffected, but the
-- DB type must match schema.prisma's UserRole enum.)
ALTER TYPE "UserRole" ADD VALUE 'INSTANSI';
