import type { Prisma, PrismaClient, Test } from '../../generated/prisma/client';
import { TestCategory, ScorerType } from '../../generated/prisma/enums';

/**
 * Shared shape + write strategy for the `seed:<slug>` scripts.
 *
 * A seed exists to bring content in line with the JSON, not to undo what the
 * admin did in the UI. So `price` and `status` are admin-owned: written only
 * when the test is created, or when the script is run with `--force`.
 * Items and interpretations are synced by their natural key (order /
 * patternCode) instead of delete-then-create, so their ids survive a re-seed
 * and old attempt responses still resolve in the review table.
 */

export interface SeedTestMeta {
  slug: string;
  name: string;
  description: string;
  category: string;
  scorerType: string;
  price: number;
  estimatedDurationMin: number;
  /** Hard limit enforced by the attempt service; null = untimed. */
  timeLimitMin?: number | null;
  /** Raw -> IQ conversion rows consumed by the scorer. */
  normTable?: { raw: number; iq: number }[] | null;
}

export interface SeedData {
  test: SeedTestMeta;
  items: { order: number; content: unknown }[];
  interpretations: { patternCode: string; title: string; body: string }[];
}

export interface SyncCount {
  created: number;
  updated: number;
  deleted: number;
}

/** Fields the seed owns on every run — content, never commercial state. */
function contentFields(meta: SeedTestMeta) {
  return {
    name: meta.name,
    description: meta.description,
    category: meta.category as unknown as TestCategory,
    scorerType: meta.scorerType as unknown as ScorerType,
    estimatedDurationMin: meta.estimatedDurationMin,
    timeLimitMin: meta.timeLimitMin ?? null,
    normTable: (meta.normTable ?? null) as Prisma.InputJsonValue,
  };
}

/** Update payload for an existing test: price and status stay untouched. */
export function updateFields(
  meta: SeedTestMeta,
  force: boolean,
): Prisma.TestUpdateInput {
  const fields: Prisma.TestUpdateInput = contentFields(meta);
  if (force) {
    fields.price = meta.price;
    fields.status = 'PUBLISHED';
  }
  return fields;
}

/** Create payload — a new test has no admin history yet, so everything lands. */
export function createFields(meta: SeedTestMeta): Prisma.TestCreateInput {
  return {
    slug: meta.slug,
    ...contentFields(meta),
    price: meta.price,
    status: 'PUBLISHED',
  };
}

export function isForce(argv: string[]): boolean {
  return argv.includes('--force');
}

export async function upsertSeedTest(
  prisma: PrismaClient,
  meta: SeedTestMeta,
  force: boolean,
): Promise<Test> {
  return prisma.test.upsert({
    where: { slug: meta.slug },
    update: updateFields(meta, force),
    create: createFields(meta),
  });
}

/** Upserts every item by (testId, order); drops orders the seed no longer has. */
export async function syncItems(
  prisma: PrismaClient,
  testId: string,
  items: { order: number; content: unknown }[],
): Promise<SyncCount> {
  const existing = await prisma.testItem.findMany({
    where: { testId },
    select: { order: true },
  });
  const known = new Set(existing.map((row) => row.order));
  const count: SyncCount = { created: 0, updated: 0, deleted: 0 };

  for (const item of items) {
    const content = item.content as Prisma.InputJsonValue;
    await prisma.testItem.upsert({
      where: { testId_order: { testId, order: item.order } },
      update: { content },
      create: { testId, order: item.order, content },
    });
    if (known.has(item.order)) count.updated += 1;
    else count.created += 1;
  }

  // An empty seed file is a mistake, not an instruction to wipe the test.
  if (items.length > 0) {
    const removed = await prisma.testItem.deleteMany({
      where: { testId, order: { notIn: items.map((item) => item.order) } },
    });
    count.deleted = removed.count;
  }
  return count;
}

/** Upserts every interpretation by (testId, patternCode); drops the rest. */
export async function syncInterpretations(
  prisma: PrismaClient,
  testId: string,
  rows: { patternCode: string; title: string; body: string }[],
): Promise<SyncCount> {
  const existing = await prisma.interpretation.findMany({
    where: { testId },
    select: { patternCode: true },
  });
  const known = new Set(existing.map((row) => row.patternCode));
  const count: SyncCount = { created: 0, updated: 0, deleted: 0 };

  for (const row of rows) {
    await prisma.interpretation.upsert({
      where: { testId_patternCode: { testId, patternCode: row.patternCode } },
      update: { title: row.title, body: row.body },
      create: { testId, ...row },
    });
    if (known.has(row.patternCode)) count.updated += 1;
    else count.created += 1;
  }

  if (rows.length > 0) {
    const removed = await prisma.interpretation.deleteMany({
      where: {
        testId,
        patternCode: { notIn: rows.map((row) => row.patternCode) },
      },
    });
    count.deleted = removed.count;
  }
  return count;
}

/** One line per run so the operator can see what actually changed. */
export function describeSync(count: SyncCount): string {
  return `${count.created} created, ${count.updated} updated, ${count.deleted} removed`;
}
