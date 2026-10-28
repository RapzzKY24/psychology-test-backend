# Arsip migrasi lama (dibekukan)

Folder ini **tidak dijalankan** Prisma. Hanya `prisma/migrations/` yang dibaca.

Histori lama diarsipkan pada 2026-10-28 karena tidak bisa mereproduksi skema dari
database kosong. Buktinya:

- `event_log` dan `idempotency_keys` tidak pernah dibuat oleh migrasi mana pun,
  padahal `20261017061538` meng-`ALTER TABLE` keduanya → gagal di DB baru.
- Enum `EventSource`, `EventDirection`, `EventStatus`, `IdempotencyStatus`,
  `PaymentProvider`, dan `PaymentVerifiedBySource` juga tidak pernah dibuat,
  padahal migrasi 2026-10-24/25 melakukan `ALTER TYPE` pada semuanya.
- Kolom pembayaran di `invoices`/`orders` (`paymentProvider`, `vaNumber`,
  `vaBankCode`, `verifiedBySource`, …) hanya ada lewat `prisma db push`.

Penggantinya: satu baseline `20260101000000_baseline` yang di-generate dari
`schema.prisma` lewat `prisma migrate diff --from-empty --to-schema`.

Untuk DB yang sudah terlanjur ada: kosongkan `_prisma_migrations`, lalu
`prisma migrate resolve --applied 20260101000000_baseline` — skemanya sudah identik
dengan baseline, jadi tidak ada yang perlu dijalankan.
