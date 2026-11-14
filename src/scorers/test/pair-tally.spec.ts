import { scorePairTally } from '../pair-tally';
import { sanitizePairItem } from '../sanitize-pair-item';
import {
  PairItemContentSchema,
  PairResponseSchema,
  pairTallyPatternCodes,
  pairTallyScales,
} from '../schemas/pair-tally';

function item(id: string, mapping: string[]) {
  return {
    id,
    content: {
      question: 'Pilih satu pernyataan.',
      statements: [`${id} kiri`, `${id} kanan`],
      mapping,
    },
  };
}

/** Six items: three pairs of N/G, three of N/A — N has twice the ceiling. */
const items = [
  item('i1', ['N', 'G']),
  item('i2', ['N', 'G']),
  item('i3', ['N', 'G']),
  item('i4', ['N', 'A']),
  item('i5', ['N', 'A']),
  item('i6', ['N', 'A']),
];

function picks(sides: number[]) {
  return sides.map((chosen, index) => ({
    itemId: `i${index + 1}`,
    value: { chosen },
  }));
}

describe('pairTallyScales', () => {
  it('collects the distinct scales in first-appearance order', () => {
    expect(pairTallyScales(items)).toEqual(['N', 'G', 'A']);
  });

  it('ignores items whose content does not parse', () => {
    expect(pairTallyScales([{ content: { question: 'x' } }])).toEqual([]);
  });

  it('is also the publish pattern set', () => {
    expect(pairTallyPatternCodes(items)).toEqual(['N', 'G', 'A']);
  });
});

describe('scorePairTally', () => {
  it('counts the scale of the picked statement', () => {
    // every answer picks the right-hand statement: G, G, G, A, A, A
    const output = scorePairTally({
      items,
      responses: picks([1, 1, 1, 1, 1, 1]),
    });

    expect(output.scores.scales.N.score).toBe(0);
    expect(output.scores.scales.G.score).toBe(3);
    expect(output.scores.scales.A.score).toBe(3);
    expect(output.scores.answered).toBe(6);
    expect(output.scores.total).toBe(6);
  });

  it('takes the scale that is strictly ahead', () => {
    // N five times, G once: N wins outright
    const output = scorePairTally({
      items,
      responses: picks([0, 0, 0, 0, 0, 1]),
    });

    expect(output.patternCode).toBe('N');
    expect(output.scores.type).toBe('N');
    expect(output.scores.scales.N.score).toBe(5);
  });

  it('gives every scale its own ceiling from the item mappings', () => {
    const output = scorePairTally({ items, responses: [] });

    expect(output.scores.scales.N.max).toBe(6);
    expect(output.scores.scales.G.max).toBe(3);
    expect(output.scores.scales.A.max).toBe(3);
    expect(output.scores.scales.G.percent).toBe(0);
  });

  it('computes percent against that ceiling', () => {
    const output = scorePairTally({
      items,
      responses: picks([0, 0, 0, 0, 0, 0]),
    });

    expect(output.scores.scales.N.percent).toBe(100);
    expect(output.scores.scales.G.percent).toBe(0);
  });

  it('falls back to the first scale in item order when the top is tied', () => {
    // G three times, A three times — N never picked
    const output = scorePairTally({
      items,
      responses: picks([1, 1, 1, 1, 1, 1]),
    });

    expect(output.scores.scales.G.score).toBe(3);
    expect(output.scores.scales.A.score).toBe(3);
    expect(output.patternCode).toBe('G');
  });

  it('uses scoringConfig.tieBreak when the top is tied', () => {
    const output = scorePairTally({
      items,
      responses: picks([1, 1, 1, 1, 1, 1]),
      scoringConfig: { tieBreak: 'A' },
    });

    expect(output.patternCode).toBe('A');
  });

  it('ignores a tieBreak that names a scale the test does not use', () => {
    const output = scorePairTally({
      items,
      responses: picks([1, 1, 1, 1, 1, 1]),
      scoringConfig: { tieBreak: 'Z' },
    });

    expect(output.patternCode).toBe('G');
  });

  it('adds a band from scoringConfig.bands', () => {
    const output = scorePairTally({
      items,
      responses: picks([0, 0, 0, 0, 0, 0]),
      scoringConfig: {
        bands: [
          { max: 2, label: 'LOW' },
          { max: 4, label: 'MIDDLE' },
          { max: 9, label: 'HIGH' },
        ],
      },
    });

    expect(output.scores.scales.N.band).toBe('HIGH');
    expect(output.scores.scales.G.band).toBe('LOW');
  });

  it('leaves the band out when the test declares none', () => {
    const output = scorePairTally({
      items,
      responses: picks([0, 0, 0, 0, 0, 0]),
    });

    expect(output.scores.scales.N.band).toBeUndefined();
  });

  it('averages the declared groups', () => {
    const output = scorePairTally({
      items,
      responses: picks([0, 0, 0, 0, 0, 1]),
      scoringConfig: {
        groups: [
          { name: 'WORK DIRECTION', scales: ['N', 'G', 'A'] },
          { name: 'LEADERSHIP', scales: ['L', 'P'] },
        ],
      },
    });

    // N=5, G=1, A=0 → (5+1+0)/3
    expect(output.scores.groups?.['WORK DIRECTION']).toBe(2);
    // L and P are not part of the test, so the group is skipped
    expect(output.scores.groups?.LEADERSHIP).toBeUndefined();
  });

  it('ignores answers for items outside the test', () => {
    const output = scorePairTally({
      items,
      responses: [
        ...picks([0, 0, 0, 0, 0, 0]),
        { itemId: 'ghost', value: { chosen: 0 } },
      ],
    });

    expect(output.scores.answered).toBe(6);
    expect(output.scores.scales.N.score).toBe(6);
  });

  it('ignores answers that do not parse', () => {
    const output = scorePairTally({
      items,
      responses: [{ itemId: 'i1', value: { chosen: 7 } }],
    });

    expect(output.scores.answered).toBe(0);
  });

  it('returns an empty code when the test has no items', () => {
    const output = scorePairTally({ items: [], responses: [] });

    expect(output.patternCode).toBe('');
    expect(output.scores.scales).toEqual({});
  });
});

describe('pair item contract', () => {
  it('keeps the pair item shape and its two-pole rule', () => {
    expect(
      PairItemContentSchema.safeParse(item('a', ['N', 'G']).content).success,
    ).toBe(true);
    expect(
      PairItemContentSchema.safeParse(item('a', ['N', 'N']).content).success,
    ).toBe(false);
  });

  it('accepts only 0 or 1 as the pick', () => {
    expect(PairResponseSchema.safeParse({ chosen: 0 }).success).toBe(true);
    expect(PairResponseSchema.safeParse({ chosen: 2 }).success).toBe(false);
  });

  it('hides the scale from the participant', () => {
    expect(sanitizePairItem(item('a', ['N', 'G']).content)).toEqual({
      question: 'Pilih satu pernyataan.',
      statements: ['a kiri', 'a kanan'],
    });
  });
});
