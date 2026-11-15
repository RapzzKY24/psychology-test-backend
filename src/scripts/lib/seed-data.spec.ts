import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getItemSchema } from '../../scorers/schemas';
import { getScorer, scoringConfigIssues } from '../../scorers/registry';
import { NormTableSchema } from '../../scorers/schemas/right-wrong-norm';
import {
  PairNormConfigSchema,
  PairNormItemContentSchema,
} from '../../scorers/schemas/pair-norm';
import {
  StyleGridConfigSchema,
  StyleGridItemContentSchema,
} from '../../scorers/schemas/style-grid';
import {
  OPTION_SCALE_DEFAULT_POINTS,
  OptionScaleItemContentSchema,
} from '../../scorers/schemas/option-scale';
import { TimedGridItemContentSchema } from '../../scorers/schemas/timed-grid';
import { ManualItemContentSchema } from '../../scorers/schemas/manual';

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
    /** Banded families (LIKERT) derive their code set from this. */
    scoringConfig?: unknown;
    ageMinMonths?: number | null;
    ageMaxMonths?: number | null;
    /** Per-scale norm rows (OPTION_SCALE reads these instead of `normTable`). */
    norms?: {
      group: string;
      scale: string | null;
      rawMin: number;
      rawMax: number;
      outputValue: number;
    }[];
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

  // Families whose code depends on the items (MBTI's cartesian product, a
  // tally's scales) can only be checked against the seed itself. A missing row
  // here is a publish 422, not a crash — but it should not reach a deploy.
  it('covers every pattern code its own items can produce', () => {
    const scorer = getScorer(seed.test.scorerType);
    if (!scorer?.patternCodesFor) return;
    const expected = scorer
      .patternCodesFor(seed.items, seed.test.scoringConfig)
      .sort();
    expect(seed.interpretations.map((row) => row.patternCode).sort()).toEqual(
      expected,
    );
  });

  it('carries a norm table the scorer can read', () => {
    if (seed.test.normTable == null) return;
    expect(NormTableSchema.safeParse(seed.test.normTable).success).toBe(true);
  });

  // STYLE_GRID keys each pick to a scale named in `scoringConfig`, so a typo in
  // either place silently drops every pick on that scale — the scale still
  // prints, it just never scores.
  it('keys every statement to a scale its config declares', () => {
    if (seed.test.scorerType !== 'STYLE_GRID') return;
    const config = StyleGridConfigSchema.safeParse(seed.test.scoringConfig);
    expect(config.success).toBe(true);
    if (!config.success) return;
    const codes = new Set(config.data.scales.map((scale) => scale.code));
    for (const item of seed.items) {
      const parsed = StyleGridItemContentSchema.safeParse(item.content);
      expect({ order: item.order, valid: parsed.success }).toEqual({
        order: item.order,
        valid: true,
      });
      if (!parsed.success) continue;
      for (const code of parsed.data.mapping) {
        expect({ order: item.order, code, declared: codes.has(code) }).toEqual({
          order: item.order,
          code,
          declared: true,
        });
      }
    }
  });

  // PAIR_NORM reads one percentile per need, so two things have to line up: a
  // mapping to an undeclared need scores nothing, and a column shorter than
  // that need's own ceiling would read the wrong row for a high raw score.
  it('reads a percentile column that covers every need’s ceiling', () => {
    if (seed.test.scorerType !== 'PAIR_NORM') return;
    const config = PairNormConfigSchema.parse(seed.test.scoringConfig);
    const codes = new Set(config.scales.map((scale) => scale.code));
    const ceiling = new Map<string, number>(
      config.scales.map((scale) => [scale.code, 0]),
    );

    for (const item of seed.items) {
      const parsed = PairNormItemContentSchema.parse(item.content);
      for (const code of parsed.mapping) {
        expect({ order: item.order, code, declared: codes.has(code) }).toEqual({
          order: item.order,
          code,
          declared: true,
        });
      }
      const [left, right] = parsed.mapping;
      // An item that names one need twice cannot separate its statements.
      if (left === right) continue;
      ceiling.set(left, (ceiling.get(left) ?? 0) + 1);
      ceiling.set(right, (ceiling.get(right) ?? 0) + 1);
    }

    for (const [set, table] of Object.entries(config.norms ?? {})) {
      for (const [sex, columns] of Object.entries(table)) {
        if (!columns) continue;
        for (const scale of config.scales) {
          const needed = (ceiling.get(scale.code) ?? 0) + 1;
          expect({
            set,
            sex,
            code: scale.code,
            rows: columns[scale.code]?.length,
          }).toEqual({ set, sex, code: scale.code, rows: needed });
        }
      }
    }

    const orders = new Set(seed.items.map((item) => item.order));
    for (const [a, b] of config.consistency?.pairs ?? []) {
      expect({ pair: [a, b], both: orders.has(a) && orders.has(b) }).toEqual({
        pair: [a, b],
        both: true,
      });
    }
  });

  // OPTION_SCALE reads one sten per factor from `norms`, so a group that stops
  // short of a factor's ceiling leaves every high raw score with a null sten —
  // and a factor no group covers can never become the pattern code.
  it('covers every factor ceiling in every norm group', () => {
    if (seed.test.scorerType !== 'OPTION_SCALE') return;
    const rows = seed.test.norms ?? [];
    const ceiling = new Map<string, number>();
    for (const item of seed.items) {
      const parsed = OptionScaleItemContentSchema.parse(item.content);
      const points = parsed.points ?? OPTION_SCALE_DEFAULT_POINTS;
      ceiling.set(
        parsed.scale,
        (ceiling.get(parsed.scale) ?? 0) + Math.max(...points),
      );
    }
    const groups = new Set(rows.map((row) => row.group));
    expect(groups.size).toBeGreaterThan(0);
    // A factor the tables never mention is a deliberate "raw only" score, and a
    // factor only some groups read is the sex-only case checked below. What
    // this loop guards is the range: a table that stops before the factor's
    // own ceiling leaves every high raw score with a null sten.
    for (const group of groups) {
      const inGroup = new Set(
        rows.filter((row) => row.group === group).map((row) => row.scale),
      );
      for (const [scale, top] of ceiling) {
        if (!inGroup.has(scale)) continue;
        const covered = rows
          .filter((row) => row.group === group && row.scale === scale)
          .some((row) => row.rawMax >= top);
        expect({ group, scale, top, covered }).toEqual({
          group,
          scale,
          top,
          covered: true,
        });
      }
    }
    const scaled = new Set(rows.map((row) => row.scale));
    for (const scale of scaled) {
      const present = [...groups].filter((group) =>
        rows.some((row) => row.group === group && row.scale === scale),
      );
      // Either every group reads this factor, or it is split by sex only —
      // 16PF's MD norm has a P and an L column and no combined one, so the
      // `_LP` groups legitimately have no row for it.
      const sexOnly = [...groups].filter((group) => !group.endsWith('_LP'));
      const inEveryGroup = present.length === groups.size;
      const inSexGroups =
        present.slice().sort().join() === sexOnly.slice().sort().join();
      expect({ scale, covered: inEveryGroup || inSexGroups }).toEqual({
        scale,
        covered: true,
      });
    }
  });

  // The work curve compares lajur against each other, so two things have to
  // hold: the printed numbers run 1..n without gaps (the review table shows
  // them, not the item order), and every lajur has the same number of gaps.
  // A short lajur caps its own correct count, which drags the mean down and
  // shows up as a dip in the curve that the participant never caused.
  it('numbers its lajur in order and gives them all the same length', () => {
    if (seed.test.scorerType !== 'TIMED_GRID') return;
    const columns = seed.items.map((item) => {
      const parsed = TimedGridItemContentSchema.parse(item.content);
      return {
        order: item.order,
        column: parsed.column,
        gaps: parsed.digits.length - 1,
      };
    });
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.map((row) => row.column)).toEqual(
      Array.from({ length: columns.length }, (_, i) => i + 1),
    );
    const gaps = [...new Set(columns.map((row) => row.gaps))];
    expect(gaps).toHaveLength(1);
  });

  // A drawing sheet is fixed: eight boxes, each printed once. A duplicate box
  // would show the participant the same mark twice, and a gap would leave a
  // box with nothing to complete — neither is visible until someone sits down
  // to take the test.
  it('prints every drawing box exactly once', () => {
    if (seed.test.scorerType !== 'MANUAL') return;
    const boxes = seed.items.map(
      (item) => ManualItemContentSchema.parse(item.content).box,
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect([...boxes].sort((a, b) => a - b)).toEqual(
      Array.from({ length: boxes.length }, (_, i) => i + 1),
    );
  });

  // The config is seed-owned and never edited in the admin UI, so nothing else
  // would catch a misspelled band key before it silently scores every
  // participant with the family defaults.
  it('carries a scoringConfig its family can read', () => {
    const scorer = getScorer(seed.test.scorerType);
    if (!scorer) return;
    expect(scoringConfigIssues(scorer, seed.test.scoringConfig)).toEqual([]);
  });

  // A reversed or half-filled band silently blocks every participant, because
  // the detail page only unlocks the CTA inside [min, max].
  it('declares an age band both ends or neither', () => {
    const { ageMinMonths: min, ageMaxMonths: max } = seed.test;
    const declared = [min, max].filter((v) => v != null);
    if (declared.length === 0) return;
    expect({
      min,
      max,
      valid:
        typeof min === 'number' &&
        typeof max === 'number' &&
        min <= max &&
        min >= 0,
    }).toEqual({
      min,
      max,
      valid: true,
    });
  });

  // The psikogram a ladder is copied from can stop short of its own item set:
  // the CFIT 3 workbooks sum 12/14/12/8 cells, capping raw at 46, while their
  // RAW SCORE sheet runs 0-49. The ladder wins, so every printed item must be
  // scorable — never trim the range to match a workbook's SUM formula.
  it('lets the last item reach the norm table', () => {
    if (seed.test.scorerType !== 'RIGHT_WRONG_NORM') return;
    if (seed.test.normTable == null) return;
    const rows = NormTableSchema.parse(seed.test.normTable);
    const top = Math.max(...rows.map((row) => row.raw));
    expect({
      items: seed.items.length,
      covered: top >= seed.items.length - 1,
    }).toEqual({ items: seed.items.length, covered: true });
  });
});
