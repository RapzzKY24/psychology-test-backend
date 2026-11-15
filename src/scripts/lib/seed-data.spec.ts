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
import {
  MultiSubtestConfigSchema,
  parseMultiSubtestItem,
  subtestOfItem,
} from '../../scorers/schemas/multi-subtest';

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

  // The Pauli packet prints two parts of 40 lajur, and Part 2 repeats 19 of
  // Part 1's lajur glyph for glyph at the same position — checked against the
  // source PDF, not a transcription slip. Pinned here so "cleaning up" the
  // duplicate has to be a decision, and so a re-extraction that drops a lajur
  // fails instead of shipping a 79-lajur sheet.
  it('keeps the lajur the Pauli packet repeats', () => {
    if (seed.test.slug !== 'pauli') return;
    const digits = seed.items.map(
      (item) => TimedGridItemContentSchema.parse(item.content).digits,
    );
    expect(digits).toHaveLength(80);
    const repeated = digits
      .slice(40)
      .map((part2, index) =>
        part2.join() === digits[index].join() ? index + 1 : null,
      )
      .filter((column) => column !== null);
    expect(repeated).toEqual([
      6, 7, 19, 20, 21, 22, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ]);
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

  // A battery splits one item list into separately normed subtests, so the
  // counts in the config have to describe the items exactly: one item too many
  // shifts every later subtest by one, and the participant is scored against
  // another subtest's norm row without anything failing.
  it('splits its items into the subtests its config declares', () => {
    if (seed.test.scorerType !== 'MULTI_SUBTEST') return;
    const config = MultiSubtestConfigSchema.parse(seed.test.scoringConfig);

    expect(config.subtests.reduce((sum, s) => sum + s.itemCount, 0)).toBe(
      seed.items.length,
    );

    for (const item of seed.items) {
      const content = parseMultiSubtestItem(item.content);
      expect({ order: item.order, valid: Boolean(content) }).toEqual({
        order: item.order,
        valid: true,
      });
      const section = subtestOfItem(config, item.order);
      // An item printed as a pair or a series belongs to the subtest that
      // prints it that way; a mismatch means the split drifted.
      const shape =
        content?.kind === 'PAIR'
          ? 'GE'
          : content?.kind === 'IMAGE'
            ? null
            : content?.kind === 'NUMBER' && content.series
              ? 'ZR'
              : null;
      if (shape) {
        expect({ order: item.order, code: section?.code }).toEqual({
          order: item.order,
          code: shape,
        });
      }
    }

    // Age bands are read in order with the first match winning, so a band
    // declared out of order makes every older participant fall into it.
    const ceilings = config.ageBands.map((band) => band.maxMonths);
    expect(ceilings).toEqual([...ceilings].sort((a, b) => a - b));
  });

  // Each subtest's raw score is read off its own row, and the total is read off
  // the band's IQ table. A row that stops before the subtest's ceiling, or a
  // band missing from either table, leaves those participants with a null
  // score — the report prints an empty cell instead of failing.
  it('covers every subtest ceiling in every age band', () => {
    if (seed.test.scorerType !== 'MULTI_SUBTEST') return;
    const config = MultiSubtestConfigSchema.parse(seed.test.scoringConfig);
    const labels = config.ageBands.map((band) => band.label);
    expect(Object.keys(config.standardScores).sort()).toEqual([...labels].sort());
    expect(Object.keys(config.iqTable).sort()).toEqual([...labels].sort());

    // GE is the one subtest whose printed rubric can exceed its item count: the
    // workbook awards 2 for a precise concept. Its raw is converted onto the
    // 1–20 scale before it meets a standard-score row, so the row covers the
    // conversion's top, not the rubric's.
    const ceiling = (code: string, itemCount: number) =>
      code === 'GE' ? Math.max(...config.geConversion) : itemCount;
    const totalCeiling = config.subtests.reduce(
      (sum, s) => sum + ceiling(s.code, s.itemCount),
      0,
    );

    for (const band of labels) {
      for (const section of config.subtests) {
        const row = config.standardScores[band]?.[section.code];
        expect({
          band,
          code: section.code,
          rows: row?.length ?? 0,
          needed: ceiling(section.code, section.itemCount) + 1,
        }).toEqual({
          band,
          code: section.code,
          rows: ceiling(section.code, section.itemCount) + 1,
          needed: ceiling(section.code, section.itemCount) + 1,
        });
      }
      expect({ band, rows: config.iqTable[band]?.length ?? 0 }).toEqual({
        band,
        rows: totalCeiling + 1,
      });
    }

    // A GE answer can earn 2, so the conversion has to reach twice the items.
    const ge = config.subtests.find((section) => section.code === 'GE');
    if (ge) {
      expect(config.geConversion.length).toBeGreaterThanOrEqual(ge.itemCount * 2 + 1);
      const geOrders = seed.items
        .filter((item) => subtestOfItem(config, item.order)?.code === 'GE')
        .map((item) => String(item.order));
      expect(Object.keys(config.geRubric).sort()).toEqual(geOrders.sort());
    }
  });

  // ME asks which category holds a word starting with a given letter, so the
  // printed list and the key have to agree. Nothing else checks that: a wrong
  // key still scores, it just scores the wrong answer as right.
  it('gives the memorisation list a word for every letter its items ask', () => {
    if (seed.test.scorerType !== 'MULTI_SUBTEST') return;
    const config = MultiSubtestConfigSchema.parse(seed.test.scoringConfig);
    const studied = config.subtests.find((s) => (s.memorizeMin ?? 0) > 0);
    if (!studied) return;

    // A study window with nothing to study is three minutes of a blank screen.
    expect(studied.memorizeList?.length ?? 0).toBeGreaterThan(0);
    const initials = new Map(
      (studied.memorizeList ?? []).map((group) => [
        group.label.toUpperCase(),
        new Set(group.words.map((word) => word[0]!.toUpperCase())),
      ]),
    );

    const items = seed.items.filter(
      (item) => subtestOfItem(config, item.order)?.code === studied.code,
    );
    expect(items.length).toBe(studied.itemCount);

    for (const item of items) {
      const content = parseMultiSubtestItem(item.content);
      if (content?.kind !== 'CHOICE') continue;
      const letter = /–\s*([A-Z])\s*–/.exec(content.prompt)?.[1] ?? null;
      const category = content.options[content.key];
      expect({
        order: item.order,
        letter,
        matched: letter !== null && (initials.get(category.toUpperCase())?.has(letter) ?? false),
      }).toEqual({ order: item.order, letter, matched: true });
    }
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
