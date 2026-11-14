import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getItemSchema } from '../../scorers/schemas';
import { NormTableSchema } from '../../scorers/schemas/right-wrong-norm';

/**
 * Seeds bypass the Test Builder, so nothing else validates their shape before
 * a deploy. This walks every committed seed and holds it to the same contract
 * the API enforces: items match their family schema, keys stay in range, and
 * every figure a seed points at is actually shipped under `assets/`.
 */
const SEED_DIR = join(__dirname, '../../../prisma/seed-data');
const ASSET_DIR = join(SEED_DIR, 'assets');

interface SeedFile {
  test: {
    slug: string;
    scorerType: string;
    normTable?: unknown;
  };
  items: { order: number; content: Record<string, unknown> }[];
  interpretations: { patternCode: string }[];
}

function seedFiles(): string[] {
  return readdirSync(SEED_DIR).filter((name) => name.endsWith('.json'));
}

function readSeed(name: string): SeedFile {
  return JSON.parse(readFileSync(join(SEED_DIR, name), 'utf-8')) as SeedFile;
}

/** imageUrl -> file, across every asset bundle (bundle names are free-form). */
function shippedFigures(): Map<string, string> {
  const figures = new Map<string, string>();
  if (!existsSync(ASSET_DIR)) return figures;
  for (const bundle of readdirSync(ASSET_DIR)) {
    const manifestPath = join(ASSET_DIR, bundle, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      items: { file: string; imageUrl: string }[];
    };
    for (const entry of manifest.items) {
      figures.set(entry.imageUrl, join(ASSET_DIR, bundle, entry.file));
    }
  }
  return figures;
}

const FILES = seedFiles();
const FIGURES = shippedFigures();

describe.each(FILES)('seed %s', (file) => {
  const seed = readSeed(file);
  const schema = getItemSchema(seed.test.scorerType);

  it('declares a scorer family this build understands', () => {
    expect(schema).not.toBeNull();
  });

  it('has items that validate against the family schema', () => {
    if (!schema) return;
    for (const item of seed.items) {
      const parsed = schema.safeParse(item.content);
      const detail = parsed.success
        ? ''
        : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      expect({ order: item.order, issues: detail }).toEqual({
        order: item.order,
        issues: '',
      });
    }
  });

  it('numbers its items without gaps or duplicates', () => {
    const orders = seed.items.map((item) => item.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(
      Array.from({ length: orders.length }, (_, i) => i + 1),
    );
  });

  it('keeps every answer key inside the option list', () => {
    for (const item of seed.items) {
      const key = item.content.correctIndexes;
      const options = item.content.options;
      if (!Array.isArray(key) || !Array.isArray(options)) continue;
      for (const index of key) {
        expect({
          order: item.order,
          outOfRange: index >= options.length,
        }).toEqual({ order: item.order, outOfRange: false });
      }
    }
  });

  it('ships every figure its items point at', () => {
    for (const item of seed.items) {
      const url = item.content.imageUrl;
      if (typeof url !== 'string') continue;
      const file = FIGURES.get(url);
      expect({ order: item.order, url, shipped: Boolean(file) }).toEqual({
        order: item.order,
        url,
        shipped: true,
      });
      expect(file && existsSync(file)).toBe(true);
    }
  });

  it('has no duplicate interpretation codes', () => {
    const codes = seed.interpretations.map((row) => row.patternCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // A missing row is invisible until a participant lands on that exact raw
  // score and the result page says "interpretasi sedang disiapkan".
  it('covers every raw score the scorer can emit', () => {
    if (seed.test.scorerType !== 'RIGHT_WRONG_NORM') return;
    const expected = Array.from(
      { length: seed.items.length + 1 },
      (_, raw) => `RAW_${raw}`,
    );
    expect(seed.interpretations.map((row) => row.patternCode).sort()).toEqual(
      expected.sort(),
    );
  });

  it('carries a norm table the scorer can read', () => {
    if (seed.test.normTable == null) return;
    expect(NormTableSchema.safeParse(seed.test.normTable).success).toBe(true);
  });
});
