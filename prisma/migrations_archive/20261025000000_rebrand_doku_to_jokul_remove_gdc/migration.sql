-- Rebrand DOKU → Jokul (Payment Simulator | Jokul by DOKU)
-- Rename enum values DOKU → JOKUL across PaymentProvider, PaymentVerifiedBySource, EventSource

ALTER TYPE "PaymentProvider" RENAME VALUE 'DOKU_VA' TO 'JOKUL_VA';
ALTER TYPE "PaymentVerifiedBySource" RENAME VALUE 'DOKU' TO 'JOKUL';
ALTER TYPE "EventSource" RENAME VALUE 'DOKU' TO 'JOKUL';

-- Remove legacy GDC columns (total GDC cleanup — no GDC remnants remain)
ALTER TABLE "orders" DROP COLUMN IF EXISTS "gdcTrxId";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "gdcReferenceNo";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "gdcExternalId";

ALTER TABLE "invoices" DROP COLUMN IF EXISTS "gdcTrxId";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "gdcReferenceNo";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "gdcExternalId";