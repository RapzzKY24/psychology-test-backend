-- Kolom ditambah nullable dulu: tabel invoices sudah berisi data, jadi
-- NOT NULL tanpa default akan menggagalkan migrasi.
ALTER TABLE "invoices" ADD COLUMN "verificationToken" TEXT;

-- Backfill: setiap invoice lama mendapat token unik sendiri.
UPDATE "invoices" SET "verificationToken" = gen_random_uuid()::text WHERE "verificationToken" IS NULL;

-- Baru dikunci setelah semua baris terisi.
ALTER TABLE "invoices" ALTER COLUMN "verificationToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_verificationToken_key" ON "invoices"("verificationToken");
