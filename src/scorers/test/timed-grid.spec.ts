import { scoreTimedGrid } from '../timed-grid';
import { sanitizeTimedGridItem } from '../sanitize-timed-grid-item';
import {
  TimedGridConfigSchema,
  TimedGridItemContentSchema,
  bandFor,
  timedGridKey,
  timedGridResponseSchema,
} from '../schemas/timed-grid';

/** Kraepelin's four factors, trimmed to the general (`Case Else`) table. */
const CONFIG = {
  factors: [
    {
      code: 'PAN',
      label: 'Kecepatan kerja',
      formula: 'MEAN_CORRECT',
      decimals: 2,
      defaultGroup: '8',
      groups: {
        '8': [
          { op: 'lte', value: 10.499, label: 'Kurang sekali' },
          { op: 'lte', value: 12.735, label: 'Kurang' },
          { op: 'lte', value: 14.972, label: 'Sedang' },
          { op: 'lte', value: 17.209, label: 'Baik' },
          { op: 'else', value: null, label: 'Baik sekali' },
        ],
      },
    },
    {
      code: 'JAN',
      label: 'Ketelitian kerja',
      formula: 'MEAN_DEVIATION',
      decimals: 3,
      defaultGroup: '5',
      groups: {
        '5': [
          { op: 'lte', value: 0.695, label: 'Baik sekali' },
          { op: 'lte', value: 1.055, label: 'Baik' },
          { op: 'lte', value: 1.417, label: 'Sedang' },
          { op: 'lte', value: 1.778, label: 'Kurang' },
          { op: 'else', value: null, label: 'Kurang sekali' },
        ],
      },
    },
    {
      code: 'HAN',
      label: 'Ketahanan kerja',
      formula: 'SLOPE',
      decimals: 2,
      defaultGroup: '7',
      groups: {
        '7': [
          { op: 'lte', value: -1.951, label: 'Kurang sekali' },
          { op: 'lte', value: -0.469, label: 'Kurang' },
          { op: 'lte', value: 1.014, label: 'Sedang' },
          { op: 'lte', value: 2.496, label: 'Baik' },
          { op: 'else', value: null, label: 'Baik sekali' },
        ],
      },
    },
    {
      code: 'TIA',
      label: 'Keajegan kerja',
      formula: 'ERRORS',
      decimals: 0,
      defaultGroup: '8',
      groups: {
        '8': [
          { op: 'gte', value: 23, label: 'Kurang sekali' },
          { op: 'gte', value: 14, label: 'Kurang' },
          { op: 'gte', value: 3, label: 'Sedang' },
          { op: 'gte', value: 1, label: 'Baik' },
          { op: 'else', value: null, label: 'Baik sekali' },
        ],
      },
    },
  ],
};

/** A lajur whose key is all zeros: `digits` of 0 make every sum 0. */
function lajur(column: number, gaps: number) {
  return {
    id: `item-${column}`,
    content: { column, digits: Array.from({ length: gaps + 1 }, () => 0) },
  };
}

/** Answers `correct` gaps right, then fills the rest with wrong digits. */
function answer(correct: number, gaps: number) {
  return {
    answers: Array.from({ length: gaps }, (_, index) => (index < correct ? 0 : 1)),
  };
}

describe('timedGridKey', () => {
  it('writes the last digit of each adjacent sum', () => {
    expect(timedGridKey([1, 2, 3, 9])).toEqual([3, 5, 2]);
    expect(timedGridKey([7, 8])).toEqual([5]);
    expect(timedGridKey([5, 5, 5])).toEqual([0, 0]);
  });
});

describe('TimedGridItemContentSchema', () => {
  it('rejects a single digit, which would have no gap', () => {
    expect(TimedGridItemContentSchema.safeParse({ column: 1, digits: [3] }).success).toBe(
      false,
    );
  });

  it('rejects a digit outside 0-9', () => {
    expect(
      TimedGridItemContentSchema.safeParse({ column: 1, digits: [1, 10] }).success,
    ).toBe(false);
  });
});

describe('timedGridResponseSchema', () => {
  it('locks the answer count to the lajur', () => {
    const schema = timedGridResponseSchema({ column: 1, digits: [1, 2, 3] });
    expect(schema.safeParse({ answers: [3, 5] }).success).toBe(true);
    expect(schema.safeParse({ answers: [3] }).success).toBe(false);
    expect(schema.safeParse({ answers: [3, 5, 7] }).success).toBe(false);
  });

  it('accepts null for a gap the timer cut off', () => {
    const schema = timedGridResponseSchema({ column: 1, digits: [1, 2] });
    expect(schema.safeParse({ answers: [null] }).success).toBe(true);
  });
});

describe('TimedGridConfigSchema', () => {
  it('accepts the Kraepelin shape', () => {
    expect(TimedGridConfigSchema.safeParse(CONFIG).success).toBe(true);
  });

  it('rejects an else row that is not last', () => {
    const broken = structuredClone(CONFIG) as typeof CONFIG;
    broken.factors[0]!.groups['8']!.unshift({
      op: 'else',
      value: null,
      label: 'x',
    } as never);
    expect(TimedGridConfigSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a group that mixes comparison directions', () => {
    const broken = structuredClone(CONFIG) as typeof CONFIG;
    broken.factors[0]!.groups['8']![1] = {
      op: 'gte',
      value: 9.52,
      label: 'Kurang',
    } as never;
    expect(TimedGridConfigSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a defaultGroup that names no table', () => {
    const broken = structuredClone(CONFIG) as typeof CONFIG;
    broken.factors[0].defaultGroup = '99';
    expect(TimedGridConfigSchema.safeParse(broken).success).toBe(false);
  });
});

describe('bandFor', () => {
  const bands = CONFIG.factors[0].groups['8'] as never;

  it('reads lte rows top-down', () => {
    expect(bandFor(bands, 7)).toBe('Kurang sekali');
    expect(bandFor(bands, 10.499)).toBe('Kurang sekali');
    expect(bandFor(bands, 13)).toBe('Sedang');
    expect(bandFor(bands, 99)).toBe('Baik sekali');
  });

  it('reads gte rows top-down', () => {
    const tia = CONFIG.factors[3].groups['8'] as never;
    expect(bandFor(tia, 30)).toBe('Kurang sekali');
    expect(bandFor(tia, 23)).toBe('Kurang sekali');
    expect(bandFor(tia, 0)).toBe('Baik sekali');
  });
});

describe('scoreTimedGrid', () => {
  const items = [lajur(1, 2), lajur(2, 4), lajur(3, 6), lajur(4, 8)];
  const responses = [
    { itemId: 'item-1', value: answer(2, 2) },
    { itemId: 'item-2', value: answer(4, 4) },
    { itemId: 'item-3', value: answer(6, 6) },
    { itemId: 'item-4', value: answer(8, 8) },
  ];

  it('counts correct, wrong and skipped per lajur', () => {
    const { scores } = scoreTimedGrid({
      items: [lajur(1, 4)],
      responses: [{ itemId: 'item-1', value: { answers: [0, 1, null, 0] } }],
      scoringConfig: CONFIG,
    });
    expect(scores.columns[0]).toEqual({
      column: 1,
      correct: 2,
      wrong: 1,
      skipped: 1,
      attempted: 3,
      gaps: 4,
    });
    expect(scores.correct).toBe(2);
    expect(scores.wrong).toBe(1);
    expect(scores.skipped).toBe(1);
  });

  it('treats a missing response as a whole lajur of skips', () => {
    const { scores } = scoreTimedGrid({
      items: [lajur(1, 3)],
      responses: [],
      scoringConfig: CONFIG,
    });
    expect(scores.columns[0]).toMatchObject({ correct: 0, wrong: 0, skipped: 3 });
  });

  it('builds the curve in item order', () => {
    const { scores } = scoreTimedGrid({ items, responses, scoringConfig: CONFIG });
    expect(scores.curve).toEqual([2, 4, 6, 8]);
    expect(scores.total).toBe(4);
    expect(scores.gaps).toBe(20);
  });

  // Pauli's workbook computes LQ, the error rate and the deviation, but carries
  // no norm table, so its seed ships without a config. The curve and the
  // per-lajur tallies must still come out — they are what the psychologist
  // reads, and a null config must not empty them.
  it('scores a grid that carries no norm table', () => {
    const { scores, patternCode } = scoreTimedGrid({ items, responses });
    expect(scores.curve).toEqual([2, 4, 6, 8]);
    expect(scores.correct).toBe(20);
    expect(scores.metrics).toEqual({});
    expect(patternCode).toBe('WORK_CURVE');
  });

  it('computes the mean correct per lajur', () => {
    const { scores } = scoreTimedGrid({ items, responses, scoringConfig: CONFIG });
    expect(scores.metrics.PAN.value).toBe(5);
    expect(scores.metrics.PAN.band).toBe('Kurang sekali');
  });

  it('computes the mean absolute deviation', () => {
    const { scores } = scoreTimedGrid({ items, responses, scoringConfig: CONFIG });
    expect(scores.metrics.JAN.value).toBe(2);
    expect(scores.metrics.JAN.band).toBe('Kurang sekali');
  });

  it('scales the regression slope by the lajur count', () => {
    // curve 2,4,6,8 has a slope of 2, so the fitted line rises by 8 over four
    // lajur — the workbook's `y(50) - y(0)` with n = 4.
    const { scores } = scoreTimedGrid({ items, responses, scoringConfig: CONFIG });
    expect(scores.metrics.HAN.value).toBe(8);
    expect(scores.metrics.HAN.band).toBe('Baik sekali');
  });

  it('counts errors plus skipped', () => {
    const { scores } = scoreTimedGrid({
      items: [lajur(1, 4)],
      responses: [{ itemId: 'item-1', value: { answers: [0, 1, null, 0] } }],
      scoringConfig: CONFIG,
    });
    expect(scores.metrics.TIA.value).toBe(2);
    expect(scores.metrics.TIA.band).toBe('Baik');
  });

  it('reads the group named by the declared education', () => {
    const config = structuredClone(CONFIG) as typeof CONFIG & {
      educationGroups: Record<string, string>;
    };
    config.educationGroups = { S1: '8', SMP_SMA: '8' };
    config.factors[0].groups['3'] = [
      { op: 'lte', value: 1, label: 'rendah' },
      { op: 'else', value: null, label: 'tinggi' },
    ] as never;
    config.educationGroups.SMP_SMA = '3';

    const { scores } = scoreTimedGrid({
      items,
      responses,
      scoringConfig: config,
      education: 'SMP_SMA',
    });
    expect(scores.metrics.PAN.group).toBe('3');
    expect(scores.metrics.PAN.band).toBe('tinggi');
  });

  it('falls back to the default group when the education has no mapping', () => {
    const { scores } = scoreTimedGrid({
      items,
      responses,
      scoringConfig: CONFIG,
      education: 'S1',
    });
    expect(scores.metrics.PAN.group).toBe('8');
  });

  it('reports WORK_CURVE and never throws on a missing config', () => {
    const output = scoreTimedGrid({ items, responses });
    expect(output.patternCode).toBe('WORK_CURVE');
    expect(output.scores.metrics).toEqual({});
    expect(output.scores.curve).toEqual([2, 4, 6, 8]);
  });
});

describe('sanitizeTimedGridItem', () => {
  it('sends the lajur and its digits, and nothing else', () => {
    expect(
      sanitizeTimedGridItem({ column: 3, digits: [1, 2, 3], key: [3, 5] }),
    ).toEqual({ column: 3, digits: [1, 2, 3] });
  });

  it('returns an empty object for unusable content', () => {
    expect(sanitizeTimedGridItem({ column: 0 })).toEqual({});
  });
});
