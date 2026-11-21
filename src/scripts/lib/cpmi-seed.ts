import type { PrismaClient } from '../../generated/prisma/client';
import type { SeedData } from './seed-test';

/**
 * CPMI ships the same 50 items, norm table and interpretations as WPT; only
 * the identity changes. Reading `wpt.json` instead of keeping a second copy
 * means a correction to a WPT item reaches CPMI on the next seed run.
 */
export const CPMI_META = {
  slug: 'cpmi',
  name: 'CPMI',
  description:
    'Tes kemampuan memecahkan masalah: 50 soal penalaran verbal, numerik, dan logika dalam 12 menit. Jawaban berupa pilihan dan isian singkat.',
} as const;

export function buildCpmiData(wpt: SeedData): SeedData {
  return { ...wpt, test: { ...wpt.test, ...CPMI_META } };
}

/**
 * The slug used to belong to a 20-item legacy test that still owns two
 * attempts. Renaming it keeps those attempts resolvable and frees `cpmi` for
 * the copy. No-op once the rename has happened.
 */
export async function archiveLegacyCpmi(
  prisma: PrismaClient,
): Promise<boolean> {
  const legacy = await prisma.test.findUnique({
    where: { slug: 'cpmi' },
    select: { id: true, status: true },
  });
  if (!legacy || legacy.status !== 'ARCHIVED') return false;

  await prisma.test.update({
    where: { id: legacy.id },
    data: { slug: 'cpmi-lama', name: 'CPMI (arsip)' },
  });
  return true;
}
