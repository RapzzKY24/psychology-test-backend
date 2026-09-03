import { SCORERS } from '../registry';

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
