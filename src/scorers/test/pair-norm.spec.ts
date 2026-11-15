import { scorePairNorm } from '../pair-norm';
import { sanitizePairNormItem } from '../sanitize-pair-norm-item';
import {
  PairNormConfigSchema,
  PairNormItemContentSchema,
  pairNormPatternCodes,
} from '../schemas/pair-norm';

/** Ten rows is enough to prove the lookup; EPPS ships 29 (raw 0–28). */
const column = (step: number) =>
  Array.from({ length: 10 }, (_, index) => Math.min(index * step, 100));

const CONFIG = {
  scales: [
    { code: 'ACH', label: 'Achievement' },
    { code: 'DEF', label: 'Deference' },
    { code: 'ORD', label: 'Order' },
  ],
  normSet: 'college',
  norms: {
    college: {
      MALE: {
        ACH: column(10),
        DEF: column(10),
        ORD: column(10),
      },
      FEMALE: {
        ACH: column(5),
        DEF: column(5),
        ORD: column(5),
      },
    },
    general: {
      MALE: {
        ACH: column(20),
        DEF: column(20),
        ORD: column(20),
      },
    },
  },
  categories: [
    { max: 3, label: 'Sangat Rendah' },
    { max: 16, label: 'Rendah' },
    { max: 84, label: 'Sedang' },
    { max: 96, label: 'Tinggi' },
    { max: null, label: 'Sangat Tinggi' },
  ],
  consistency: {
    pairs: [[1, 4]],
    bands: [
      { max: 0, label: 'Meragukan' },
      { max: null, label: 'Konsisten' },
    ],
  },
};

/**
 * Six items over three needs.
 *
 * ACH can be reached four times (1-A, 2-A, 3-B, 4-B), DEF four times
 * (1-B, 3-A, 4-A, 6-B) and ORD three times — item 5 maps both statements to
 * ORD, so it must not raise that ceiling.
 */
const ITEMS = [
  {
    id: 'i1',
    order: 1,
    content: { statements: ['a1', 'b1'], mapping: ['ACH', 'DEF'] },
  },
  {
    id: 'i2',
    order: 2,
    content: { statements: ['a2', 'b2'], mapping: ['ACH', 'ORD'] },
  },
  {
    id: 'i3',
    order: 3,
    content: { statements: ['a3', 'b3'], mapping: ['DEF', 'ACH'] },
  },
  {
    id: 'i4',
    order: 4,
    content: { statements: ['a4', 'b4'], mapping: ['DEF', 'ACH'] },
  },
  {
    id: 'i5',
    order: 5,
    content: { statements: ['a5', 'b5'], mapping: ['ORD', 'ORD'] },
  },
  {
    id: 'i6',
    order: 6,
    content: { statements: ['a6', 'b6'], mapping: ['ORD', 'DEF'] },
  },
];

const answers = (...chosen: number[]) =>
  ITEMS.slice(0, chosen.length).map((item, index) => ({
    itemId: item.id,
    value: { chosen: chosen[index] },
  }));

describe('PAIR_NORM item schema', () => {
  it('accepts two statements that score the same need', () => {
    const parsed = PairNormItemContentSchema.safeParse({
      statements: ['a', 'b'],
      mapping: ['ACH', 'ACH'],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects identical statements', () => {
    const parsed = PairNormItemContentSchema.safeParse({
      statements: ['same', 'same'],
      mapping: ['ACH', 'DEF'],
    });
    expect(parsed.success).toBe(false);
  });

  it('hides the mapping from the participant', () => {
    expect(sanitizePairNormItem(ITEMS[0].content)).toEqual({
      statements: ['a1', 'b1'],
    });
  });
});

describe('scorePairNorm', () => {
  it('adds the pick to the need of the chosen statement', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: CONFIG,
    });

    expect(scores.scales.ACH.score).toBe(2);
    expect(scores.scales.DEF.score).toBe(1);
    expect(scores.scales.ORD.score).toBe(2);
    expect(scores.answered).toBe(6);
    expect(scores.total).toBe(6);
  });

  it('leaves the ceiling alone for an item that scores one need twice', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: CONFIG,
    });

    expect(scores.scales.ACH.max).toBe(4);
    expect(scores.scales.DEF.max).toBe(4);
    // ORD is reachable from item 2-B and item 6-A; item 5 maps both of its
    // statements to ORD, so it cannot separate them and adds no ceiling.
    expect(scores.scales.ORD.max).toBe(2);
  });

  it('never scores a self-pair item', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: [{ itemId: 'i5', value: { chosen: 0 } }],
      scoringConfig: CONFIG,
    });

    expect(scores.scales.ORD.score).toBe(0);
    expect(scores.answered).toBe(1);
  });

  it('reads the percentile and the category from the norm table', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: CONFIG,
    });

    expect(scores.scales.ACH.percent).toBe(20);
    expect(scores.scales.ACH.band).toBe('Sedang');
    expect(scores.scales.DEF.percent).toBe(10);
    expect(scores.scales.DEF.band).toBe('Rendah');
    expect(scores.normSet).toBe('college');
    expect(scores.gender).toBe('MALE');
  });

  it('uses the table matching the declared sex', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: CONFIG,
      gender: 'FEMALE',
    });

    expect(scores.scales.ACH.percent).toBe(10);
    expect(scores.gender).toBe('FEMALE');
  });

  it('falls back to the first table when the sex is undeclared', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: { ...CONFIG, normSet: 'general' },
    });

    expect(scores.normSet).toBe('general');
    expect(scores.scales.ACH.percent).toBe(40);
  });

  it('clamps a raw score past the last row of the table', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: {
        ...CONFIG,
        norms: {
          college: {
            MALE: {
              ACH: [0, 10],
              DEF: [0, 10],
              ORD: [0, 10],
            },
          },
        },
      },
    });

    expect(scores.scales.ACH.percent).toBe(10);
  });

  it('falls back to the share of the ceiling without a norm table', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: { scales: CONFIG.scales, categories: CONFIG.categories },
    });

    expect(scores.normSet).toBeNull();
    expect(scores.scales.ACH.percent).toBe(50);
    expect(scores.scales.ACH.band).toBeNull();
  });

  it('names the need with the highest percentile, not the highest raw', () => {
    const { scores, patternCode } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: {
        ...CONFIG,
        // A raw 1 on DEF reads 90 while a raw 2 on ACH only reads 20.
        norms: {
          college: {
            MALE: {
              ACH: column(10),
              DEF: [0, 90, 91, 92, 93, 94, 95, 96, 97, 98],
              ORD: column(10),
            },
          },
        },
      },
    });

    expect(scores.scales.DEF.score).toBe(1);
    expect(scores.type).toBe('DEF');
    expect(patternCode).toBe('DEF');
  });

  it('breaks a percentile tie with the configured scale', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: { ...CONFIG, tieBreak: 'ORD' },
    });

    expect(scores.scales.ACH.percent).toBe(20);
    expect(scores.scales.ORD.percent).toBe(20);
    expect(scores.type).toBe('ORD');
  });

  it('falls back to the first tied scale without a tie-break', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: CONFIG,
    });

    expect(scores.type).toBe('ACH');
  });

  it('counts a repeated item answered the same way', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 0, 0, 0),
      scoringConfig: CONFIG,
    });

    expect(scores.consistency).toEqual({
      raw: 1,
      max: 1,
      band: 'Konsisten',
      valid: true,
    });
  });

  it('flags a repeated item answered differently', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: answers(0, 1, 0, 1, 0, 0),
      scoringConfig: CONFIG,
    });

    expect(scores.consistency?.raw).toBe(0);
    expect(scores.consistency?.band).toBe('Meragukan');
    expect(scores.consistency?.valid).toBe(false);
  });

  it('skips a pair whose items were not answered', () => {
    const { scores } = scorePairNorm({
      items: ITEMS,
      responses: [{ itemId: 'i1', value: { chosen: 0 } }],
      scoringConfig: CONFIG,
    });

    expect(scores.consistency?.raw).toBe(0);
  });

  it('ignores a mapping to a scale the config does not declare', () => {
    const { scores } = scorePairNorm({
      items: [
        {
          id: 'x',
          order: 1,
          content: { statements: ['a', 'b'], mapping: ['ACH', 'XYZ'] },
        },
      ],
      responses: [{ itemId: 'x', value: { chosen: 1 } }],
      scoringConfig: CONFIG,
    });

    expect(Object.keys(scores.scales)).toEqual(['ACH', 'DEF', 'ORD']);
    expect(scores.scales.ACH.score).toBe(0);
  });

  it('derives the pattern codes from the declared scales', () => {
    expect(pairNormPatternCodes(CONFIG)).toEqual(['ACH', 'DEF', 'ORD']);
    expect(pairNormPatternCodes(undefined)).toEqual([]);
  });
});

describe('PairNormConfigSchema', () => {
  it('accepts the test config', () => {
    expect(PairNormConfigSchema.safeParse(CONFIG).success).toBe(true);
  });

  it('rejects a duplicate scale code', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      scales: [{ code: 'ACH' }, { code: 'ACH' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a norm set without a column for every scale', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      norms: { college: { MALE: { ACH: column(1), DEF: column(1) } } },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects columns of different lengths', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      norms: {
        college: {
          MALE: { ACH: column(1), DEF: column(1), ORD: [0, 1, 2] },
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a column for an undeclared scale', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      norms: {
        college: {
          MALE: {
            ACH: column(1),
            DEF: column(1),
            ORD: column(1),
            XYZ: column(1),
          },
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a normSet with no table', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      normSet: 'executive',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects bands that are not ascending', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      categories: [
        { max: 84, label: 'Sedang' },
        { max: 16, label: 'Rendah' },
        { max: null, label: 'Tinggi' },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an open band that is not last', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      categories: [
        { max: null, label: 'Sedang' },
        { max: 100, label: 'Tinggi' },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a consistency pair that names one item twice', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      consistency: { ...CONFIG.consistency, pairs: [[1, 1]] },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an item used in two consistency pairs', () => {
    const parsed = PairNormConfigSchema.safeParse({
      ...CONFIG,
      consistency: {
        ...CONFIG.consistency,
        pairs: [
          [1, 2],
          [2, 3],
        ],
      },
    });
    expect(parsed.success).toBe(false);
  });
});
