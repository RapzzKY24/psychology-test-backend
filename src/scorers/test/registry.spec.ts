import { SCORERS, getResponseSchema, scoringConfigIssues } from '../registry';

const disc = SCORERS.FORCED_CHOICE_DISC;

const items = [
  {
    id: 'it-1',
    content: {
      words: ['a', 'b', 'c', 'd'],
      mostMapping: ['D', 'I', 'S', 'C'],
      leastMapping: ['D', 'I', 'S', 'C'],
    },
  },
  {
    id: 'it-2',
    content: {
      words: ['e', 'f', 'g', 'h'],
      mostMapping: ['I', 'D', 'S', 'C'],
      leastMapping: ['I', 'D', 'S', 'C'],
    },
  },
];

const responses = [
  // it-1: most(0) -> D, least(1) -> I    (twice)
  { itemId: 'it-1', value: { most: 0, least: 1 } },
  { itemId: 'it-1', value: { most: 0, least: 1 } },
  // it-2: most(0) -> I, least(1) -> D
  { itemId: 'it-2', value: { most: 0, least: 1 } },
];

describe('SCORERS registry (task 4.3)', () => {
  it('exposes DISC item + response schema and the full pattern catalog', () => {
    expect(disc.itemSchema.safeParse(items[0].content).success).toBe(true);
    expect(disc.responseSchema.safeParse({ most: 0, least: 1 }).success).toBe(
      true,
    );
    expect(disc.responseSchema.safeParse({ most: 0, least: 0 }).success).toBe(
      false,
    );
    expect(disc.responseSchema.safeParse({ most: 4, least: 1 }).success).toBe(
      false,
    );
    expect(disc.patternCatalog).toHaveLength(40);
    expect(disc.patternCatalog).toContain('40');
    expect(disc.patternCatalog[0]).toBe('1');
  });

  it('sanitize strips the hidden mapping key from DISC content', () => {
    expect(disc.sanitize(items[0].content as never)).toEqual({
      words: ['a', 'b', 'c', 'd'],
    });
  });

  it('stub score tallies most/least and returns the top most-letter pattern', async () => {
    const out = await disc.score({
      items: items,
      responses: responses,
    });
    expect(out.scores).toHaveProperty('M');
    expect(out.scores).toHaveProperty('P');
    expect(out.scores).toHaveProperty('graph');
    // D(M)=2, I(M)=1, P(D)=1,P(I)=2, graph D=1,I=-1 -> top is D, numeric mapping gives 38
    expect(out.patternCode).toBe('38');
  });
});

describe('SCALE_TALLY registry entry', () => {
  const tally = SCORERS.SCALE_TALLY;
  const tallyItems = [
    {
      id: 't1',
      content: { question: 'a', options: ['Ya', 'Tidak'], scale: 'R' },
    },
    {
      id: 't2',
      content: { question: 'b', options: ['Ya', 'Tidak'], scale: 'I' },
    },
  ];

  it('derives its pattern codes from the item scales', () => {
    expect(tally.patternCodesFor?.(tallyItems)).toEqual(['R', 'I']);
    expect(tally.patternCatalog).toEqual([]);
  });

  it('scores through the registry and strips the scale on sanitize', async () => {
    const out = await tally.score({
      items: tallyItems,
      responses: [{ itemId: 't2', value: { chosen: 0 } }],
    });

    expect(out.patternCode).toBe('I');
    expect(tally.sanitize(tallyItems[0].content)).toEqual({
      question: 'a',
      options: ['Ya', 'Tidak'],
    });
  });
});

describe('scoringConfigIssues', () => {
  const likert = SCORERS.LIKERT;

  it('accepts a missing config — every family with settings has a default', () => {
    expect(scoringConfigIssues(likert, null)).toEqual([]);
    expect(scoringConfigIssues(likert, undefined)).toEqual([]);
  });

  it('accepts the shape the Big Five seed ships', () => {
    expect(
      scoringConfigIssues(likert, {
        ratingRange: { min: 1, max: 5 },
        bands: [
          { max: 33, label: 'Rendah' },
          { max: 66, label: 'Sedang' },
          { max: 100, label: 'Tinggi' },
        ],
      }),
    ).toEqual([]);
  });

  it('names the offending path so a seed typo is obvious', () => {
    const issues = scoringConfigIssues(likert, {
      ratingrange: { min: 1, max: 5 },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('ratingrange');
    expect(issues[0]).toContain('scoringConfig');
  });

  it('rejects a band table the scorer could not cut', () => {
    const issues = scoringConfigIssues(likert, {
      bands: [{ max: 120, label: 'Terlalu tinggi' }],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('scoringConfig.bands.0.max');
  });

  it('rejects a rating range that is empty or reversed', () => {
    expect(
      scoringConfigIssues(likert, { ratingRange: { min: 5, max: 5 } }),
    ).toHaveLength(1);
    expect(
      scoringConfigIssues(SCORERS.PAIR_TALLY, { tieBreak: 'N', bands: [] }),
    ).toEqual([]);
    expect(
      scoringConfigIssues(SCORERS.CHOICE_TALLY, { tiebreak: 'CA' }),
    ).toHaveLength(1);
  });

  it('stays quiet for a family that has no config at all', () => {
    expect(
      scoringConfigIssues(SCORERS.FORCED_CHOICE_DISC, { junk: 1 }),
    ).toEqual([]);
    expect(SCORERS.FORCED_CHOICE_DISC.configSchema).toBeUndefined();
  });
});

describe('getResponseSchema', () => {
  it('narrows the answer to the test range for a Likert inventory', () => {
    const schema = getResponseSchema(SCORERS.LIKERT, {
      ratingRange: { min: 0, max: 3 },
    });

    expect(schema.safeParse({ rating: 0 }).success).toBe(true);
    expect(schema.safeParse({ rating: 4 }).success).toBe(false);
    // The family-wide schema would have accepted 4.
    expect(SCORERS.LIKERT.responseSchema.safeParse({ rating: 4 }).success).toBe(
      true,
    );
  });

  it('falls back to the family schema when the test carries no config', () => {
    expect(
      getResponseSchema(SCORERS.LIKERT, null).safeParse({ rating: 5 }).success,
    ).toBe(true);
  });

  it('returns the family schema for a family that has no per-test bounds', () => {
    expect(getResponseSchema(SCORERS.FORCED_CHOICE_DISC, {})).toBe(
      SCORERS.FORCED_CHOICE_DISC.responseSchema,
    );
  });
});
