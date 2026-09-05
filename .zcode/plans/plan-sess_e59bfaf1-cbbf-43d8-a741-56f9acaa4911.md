# Klasifikasi Review Psikolog untuk 30 Tes — Catat Keputusan ke Docs

## Konteks (sudah disepakati via diskusi)

- **Pertanyaan:** tes mana yang bisa dicek murni sistem vs butuh pemeriksaan psikolog di dashboard.
- **Jawaban (hasil bedah 29 folder instrumen + Excel skoring):**
  - **Bucket A — auto-score penuh (20 tes):** kognitif (IST, TIU 5/6, SPM, CFIT 2A/2B/3A/3B, WPT, Army Alpha, Aptitude, FRT) + kepribadian tipe/band (DISC, Big Five, Enneagram, AQ, Holland, MBTI, MSAI, MSDT). Sistem hitung skor + interpretasi template.
  - **Bucket B — auto-score, interpretasi wajib psikolog (8 tes):** EPPS, PAPI Kostick, 16PF, Kuder, RMIB, MMPI, Kraepelin, Pauli. Skor mekanis, tapi maknanya judgment klinis/profil.
  - **Bucket C — full manual (1 tes):** Wartegg (proyektif gambar, `scorerType: MANUAL`).
- **Keputusan produk:** SEMUA hasil tetap lewat psikolog (`PENDING_REVIEW → approve → QR → PDF`, ADR-007). Tidak ada auto-approve → **tidak ada perubahan schema/kode**.

## Perubahan (docs-only, 1 file)

**File: `docs/test-library-mechanics.md`** (parent repo) — tambah **§5 "Klasifikasi review psikolog per tes"** setelah §4, berisi:

1. **Tabel 3 bucket** di atas, dengan kolom: tes, apa yang sistem hitung, apa yang psikolog lakukan di dashboard.
2. **Arti per bucket untuk dashboard (feature 06):**
   - Bucket A → psikolog *verifier*: cek jawaban mentah di review detail → approve (review ringan, kandidat bulk-approve di masa depan).
   - Bucket B → psikolog *interpreter*: WAJIB menulis interpretasi via `PATCH /reviews/:id/notes` dan/atau koreksi via `PATCH /reviews/:id/scores` sebelum approve.
   - Bucket C → psikolog *pemeriksa penuh*: lihat gambar upload, tulis seluruh hasil di notes, `patternCode: "MANUAL"`.
3. **Keputusan + catatan revisit:** semua result `PENDING_REVIEW` (keputusan 2026-09-05); field `reviewPolicy`/auto-approve tidak dibutuhkan sekarang — revisit hanya jika kelak ada produk self-service hasil instan (dengan catatan legal: laporan psikologi resmi wajib ttd psikolog bersertifikat/SIPP; hasil instan harus diberi label "hasil tes", bukan "laporan psikologi").
4. Update header rollout §3 bila perlu untuk merujuk bucket (tanpa mengubah prioritas fase yang sudah ada).

## Verifikasi

- Read ulang file hasil edit: tidak ada kontradiksi dengan §2 (family A–G) dan feature 06 (endpoint notes/scores/approve sudah support semua bucket tanpa perubahan).
- Commit docs di parent repo, ikuti konvensi `type(scope): subject` — mis. `docs(test-library): psychologist review classification per test bucket` (docs-only di parent repo, bukan backend; tidak push langsung kalau konvensi parent repo sama seperti backend).

## Yang TIDAK dilakukan (YAGNI)

- Tidak ada perubahan schema Prisma, scorer, atau endpoint — arsitektur sekarang sudah mendukung ketiga bucket.
- Tidak bikin spec terpisah di `docs/superpowers/specs/` — klasifikasi ini memang milik `test-library-mechanics.md` (home resmi "aturan nambah tes baru").