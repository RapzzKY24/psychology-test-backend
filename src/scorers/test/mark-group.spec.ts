import { SCORERS, getResponseSchema, scoringConfigIssues } from '../registry';
import {
  MarkGroupConfigSchema,
  MarkGroupItemContentSchema,
  markGroupResponseSchema,
  markGroupScales,
} from '../schemas/mark-group';
import { scoreMarkGroup } from '../mark-group';

/**
 * Two lists of three activities. `OUT` appears twice so it can win outright,
 * and one activity belongs to no field at all — Kuder ships such activities
 * and they only feed the validity scale.
 */
const items = [
  {
    id: 'it-1',
    content: {
      question: 'Kelompok 1',
      options: ['Berkebun', 'Membongkar mesin', 'Menanam padi'],
      mapping: [['OUT'], ['ME'], ['OUT', 'ME']],
      verification: [2],
    },
  },
  {
    id: 'it-2',
    content: {
      question: 'Kelompok 2',
      options: ['Melukis', 'Menggambar sketsa', 'Membaca puisi'],
      mapping: [['ART'], ['ART'], []],
      verification: [0],
    },
  },
];

const config = {
  norms: {
    MALE: {
      OUT: [0, 0.5, 0.9],
      ME: [0, 0.2, 0.4],
      ART: [0, 0.1, 0.3],
    },
    FEMALE: {
      OUT: [0, 0.1, 0.2],
      ME: [0, 0.3, 0.6],
      ART: [0, 0.7, 0.8],
    },
  },
  bands: [
    { max: 24, label: 'Rendah' },
    { max: 74, label: 'Cukup' },
    { max: 100, label: 'Tinggi' },
  ],
  verificationBands: [
    { max: 0, label: 'Kurang valid' },
    { max: 1, label: 'Valid' },
    { max: 2, label: 'Kurang valid' },
  ],
};

describe('MarkGroupItemContentSchema', () => {
  it('accepts a list whose mapping follows its options', () => {
    expect(MarkGroupItemContentSchema.safeParse(items[0].content).success).toBe(
      true,
    );
  });

  it('uppercases the field codes so the seed and the scorer agree', () => {
    const parsed = MarkGroupItemContentSchema.parse({
      options: ['a', 'b'],
      mapping: [['out'], ['s.s']],
    });
    expect(parsed.mapping).toEqual([['OUT'], ['S.S']]);
  });

  it('rejects a mapping that does not cover every option', () => {
    const parsed = MarkGroupItemContentSchema.safeParse({
      options: ['a', 'b'],
      mapping: [['OUT']],
    });
    expect(parsed.success).toBe(false);
    expect(
      parsed.error?.issues.some((i) =>
        i.message.includes('fields of every option'),
      ),
    ).toBe(true);
  });

  it('rejects a verification index outside the list', () => {
    const parsed = MarkGroupItemContentSchema.safeParse({
      options: ['a', 'b'],
      mapping: [['OUT'], ['ME']],
      verification: [2],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('markGroupResponseSchema', () => {
  it('bounds the marks by the list it belongs to', () => {
    const schema = markGroupResponseSchema(items[0].content);
    expect(schema.safeParse({ liked: [0], disliked: [2] }).success).toBe(true);
    expect(schema.safeParse({ liked: [3], disliked: [] }).success).toBe(false);
  });

  it('refuses to mark one activity on both sides', () => {
    const schema = markGroupResponseSchema(items[0].content);
    const parsed = schema.safeParse({ liked: [0], disliked: [0] });
    expect(parsed.success).toBe(false);
  });

  it('accepts an empty list — a participant may dislike nothing', () => {
    expect(
      markGroupResponseSchema(items[0].content).safeParse({
        liked: [],
        disliked: [],
      }).success,
    ).toBe(true);
  });
});

describe('scoreMarkGroup', () => {
  it('adds a like to every field the activity loads on', () => {
    const out = scoreMarkGroup({
      items,
      responses: [
        // Both OUT activities liked: OUT = 2, ME = 0 (the shared activity adds
        // to both, but the second list touches neither).
        { itemId: 'it-1', value: { liked: [0, 2], disliked: [] } },
        { itemId: 'it-2', value: { liked: [], disliked: [] } },
      ],
      scoringConfig: config,
      gender: 'MALE',
    });

    expect(out.scores.scales.OUT).toEqual({
      score: 2,
      min: -2,
      max: 2,
      percent: 90,
      band: 'Tinggi',
    });
    // The shared activity also moved ME, so ME is 1 and reads its own row.
    expect(out.scores.scales.ME).toEqual({
      score: 1,
      min: -2,
      max: 2,
      percent: 20,
      band: 'Rendah',
    });
    expect(out.patternCode).toBe('OUT');
    expect(out.scores.type).toBe('OUT_ME_ART');
  });

  it('takes a point away for a dislike', () => {
    const out = scoreMarkGroup({
      items,
      responses: [
        { itemId: 'it-1', value: { liked: [0], disliked: [2] } },
        { itemId: 'it-2', value: { liked: [], disliked: [] } },
      ],
      scoringConfig: config,
      gender: 'MALE',
    });

    expect(out.scores.scales.OUT.score).toBe(0);
    expect(out.scores.scales.ME.score).toBe(-1);
    // A negative score has no row in the source table, so no percentile.
    expect(out.scores.scales.ME.percent).toBe(0);
    expect(out.scores.scales.ME.band).toBeNull();
  });

  it('reads the table of the declared sex', () => {
    const responses = [
      { itemId: 'it-1', value: { liked: [0], disliked: [] } },
      { itemId: 'it-2', value: { liked: [0], disliked: [] } },
    ];
    const male = scoreMarkGroup({
      items,
      responses,
      scoringConfig: config,
      gender: 'MALE',
    });
    const female = scoreMarkGroup({
      items,
      responses,
      scoringConfig: config,
      gender: 'FEMALE',
    });

    expect(male.scores.scales.ART.percent).toBe(10);
    expect(female.scores.scales.ART.percent).toBe(70);
    // The same answers rank the fields differently, because the tables differ.
    expect(male.patternCode).toBe('OUT');
    expect(female.patternCode).toBe('ART');
  });

  it('reads the last row for a score past the table', () => {
    const out = scoreMarkGroup({
      items: [
        {
          id: 'big',
          content: {
            options: ['a', 'b', 'c', 'd'],
            mapping: [['OUT'], ['OUT'], ['OUT'], ['OUT']],
          },
        },
      ],
      responses: [
        { itemId: 'big', value: { liked: [0, 1, 2, 3], disliked: [] } },
      ],
      scoringConfig: config,
      gender: 'MALE',
    });

    // Raw 4 is past the three-row table, so the top row (0.9) applies.
    expect(out.scores.scales.OUT.score).toBe(4);
    expect(out.scores.scales.OUT.percent).toBe(90);
  });

  it('reports no percentile without a sex', () => {
    const out = scoreMarkGroup({
      items,
      responses: [{ itemId: 'it-1', value: { liked: [0], disliked: [] } }],
      scoringConfig: config,
    });

    expect(out.scores.gender).toBeNull();
    expect(out.scores.scales.OUT.score).toBe(1);
    expect(out.scores.scales.OUT.percent).toBe(0);
  });

  it('counts only the flagged activities for the validity scale', () => {
    const out = scoreMarkGroup({
      items,
      responses: [
        // it-1 flags option 2, it-2 flags option 0.
        { itemId: 'it-1', value: { liked: [0], disliked: [2] } },
        { itemId: 'it-2', value: { liked: [0], disliked: [] } },
      ],
      scoringConfig: config,
      gender: 'MALE',
    });

    expect(out.scores.verification).toEqual({
      raw: 2,
      max: 2,
      band: 'Kurang valid',
    });
  });

  it('keeps the first field on an exact tie', () => {
    const out = scoreMarkGroup({
      items,
      responses: [
        { itemId: 'it-1', value: { liked: [], disliked: [] } },
        { itemId: 'it-2', value: { liked: [], disliked: [] } },
      ],
      scoringConfig: config,
      gender: 'MALE',
    });

    expect(out.patternCode).toBe('OUT');
    expect(out.scores.type).toBe('OUT_ME_ART');
  });

  it('scores what it can when a list has no response', () => {
    const out = scoreMarkGroup({
      items,
      responses: [{ itemId: 'it-1', value: { liked: [0], disliked: [] } }],
      scoringConfig: config,
      gender: 'MALE',
    });

    expect(out.scores.answered).toBe(1);
    expect(out.scores.total).toBe(2);
    expect(out.scores.scales.OUT.score).toBe(1);
  });
});

describe('MARK_GROUP registry entry', () => {
  const scorer = SCORERS.MARK_GROUP;

  it('derives its pattern codes from the field mapping', () => {
    expect(scorer.patternCodesFor?.(items)).toEqual(['OUT', 'ME', 'ART']);
    expect(markGroupScales(items)).toEqual(['OUT', 'ME', 'ART']);
    expect(scorer.patternCatalog).toEqual([]);
  });

  it('hides the mapping and the verification flags from the participant', () => {
    expect(scorer.sanitize(items[0].content)).toEqual({
      question: 'Kelompok 1',
      options: ['Berkebun', 'Membongkar mesin', 'Menanam padi'],
    });
  });

  it('asks for a sex whenever the norm table is split', () => {
    expect(scorer.requiresGenderFor?.(items, config)).toBe(true);
    expect(
      scorer.requiresGenderFor?.(items, { norms: { MALE: { OUT: [0] } } }),
    ).toBe(false);
    expect(scorer.requiresGenderFor?.(items, null)).toBe(false);
  });

  it('scores through the registry', async () => {
    const out = await scorer.score({
      items,
      responses: [{ itemId: 'it-1', value: { liked: [0], disliked: [] } }],
      scoringConfig: config,
      gender: 'MALE',
    });

    expect(out.patternCode).toBe('OUT');
    expect(out.scores).toHaveProperty('verification');
  });

  it('accepts the config the seed ships', () => {
    expect(scoringConfigIssues(scorer, config)).toEqual([]);
    expect(
      scoringConfigIssues(scorer, { norms: { MALE: { OUT: [0] } }, band: [] }),
    ).toHaveLength(1);
  });

  it('bounds the answer by the item, not by the family default', () => {
    const schema = getResponseSchema(scorer, config, items[0].content);
    expect(schema.safeParse({ liked: [0], disliked: [1] }).success).toBe(true);
    expect(schema.safeParse({ liked: [7], disliked: [] }).success).toBe(false);
  });
});

describe('MarkGroupConfigSchema', () => {
  it('rejects a percentile outside 0-1', () => {
    expect(
      MarkGroupConfigSchema.safeParse({
        norms: { MALE: { OUT: [0, 90] } },
      }).success,
    ).toBe(false);
  });
});
