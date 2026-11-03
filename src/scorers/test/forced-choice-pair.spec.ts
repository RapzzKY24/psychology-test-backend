import { scoreForcedChoicePair } from '../forced-choice-pair';
import { sanitizePairItem } from '../sanitize-pair-item';
import {
  PairItemContentSchema,
  pairPatternCodes,
} from '../schemas/forced-choice-pair';

function item(
  id: string,
  left: string,
  right: string,
  statements: [string, string] = [left + ' side', right + ' side'],
) {
  return {
    id,
    content: {
      question: 'Mana yang lebih Anda pilih?',
      statements,
      mapping: [left, right],
    },
  };
}

/** Four dichotomies, one item each, in MBTI order: EI, SN, TF, JP. */
const items = [
  item('i1', 'E', 'I'),
  item('i2', 'S', 'N'),
  item('i3', 'T', 'F'),
  item('i4', 'J', 'P'),
];

const pick = (id: string, chosen: number) => ({
  itemId: id,
  value: { chosen },
});

describe('scoreForcedChoicePair', () => {
  it('takes the left pole of every dimension when the first statement is chosen', () => {
    const out = scoreForcedChoicePair({
      items,
      responses: [pick('i1', 0), pick('i2', 0), pick('i3', 0), pick('i4', 0)],
    });

    expect(out.patternCode).toBe('ESTJ');
    expect(out.scores.type).toBe('ESTJ');
    expect(out.scores.answered).toBe(4);
    expect(out.scores.total).toBe(4);
  });

  it('takes the right pole of every dimension when the second statement is chosen', () => {
    const out = scoreForcedChoicePair({
      items,
      responses: [pick('i1', 1), pick('i2', 1), pick('i3', 1), pick('i4', 1)],
    });

    expect(out.patternCode).toBe('INFP');
  });

  it('resolves a tie to the right pole, matching the source spreadsheet', () => {
    // One E, one I -> tie -> I wins.
    const tieItems = [item('a', 'E', 'I'), item('b', 'E', 'I')];
    const out = scoreForcedChoicePair({
      items: tieItems,
      responses: [pick('a', 0), pick('b', 1)],
    });

    expect(out.scores.dimensions.EI).toMatchObject({
      left: 'E',
      right: 'I',
      leftCount: 1,
      rightCount: 1,
      leftPercent: 50,
      rightPercent: 50,
      winner: 'I',
    });
    expect(out.patternCode).toBe('I');
  });

  it('scores an empty attempt on the right poles instead of failing', () => {
    const out = scoreForcedChoicePair({ items, responses: [] });

    expect(out.scores.answered).toBe(0);
    expect(out.scores.dimensions.EI).toMatchObject({
      leftCount: 0,
      rightCount: 0,
      leftPercent: 0,
      rightPercent: 0,
      winner: 'I',
    });
    expect(out.patternCode).toBe('INFP');
  });

  it('counts the majority and the percentages per dimension', () => {
    const out = scoreForcedChoicePair({
      items: [item('a', 'E', 'I'), item('b', 'E', 'I'), item('c', 'E', 'I')],
      responses: [pick('a', 0), pick('b', 0), pick('c', 1)],
    });

    expect(out.scores.dimensions.EI).toMatchObject({
      leftCount: 2,
      rightCount: 1,
      leftPercent: 67,
      rightPercent: 33,
      winner: 'E',
    });
  });

  it('groups reversed mappings into the same dimension', () => {
    const out = scoreForcedChoicePair({
      items: [item('a', 'E', 'I'), item('b', 'I', 'E')],
      // First item: pick I. Second item (reversed): pick E — also the I pole.
      responses: [pick('a', 1), pick('b', 0)],
    });

    expect(Object.keys(out.scores.dimensions)).toEqual(['EI']);
    expect(out.scores.dimensions.EI).toMatchObject({
      leftCount: 0,
      rightCount: 2,
      winner: 'I',
    });
  });

  it('ignores unknown items and malformed answers', () => {
    const out = scoreForcedChoicePair({
      items,
      responses: [
        pick('i1', 0),
        pick('nope', 0),
        { itemId: 'i2', value: { chosen: 7 } },
        { itemId: 'i3', value: {} },
      ],
    });

    expect(out.scores.answered).toBe(1);
    expect(out.scores.dimensions.EI.winner).toBe('E');
    // Key is the sorted pole pair, so S/N is stored as "NS".
    expect(out.scores.dimensions.NS.winner).toBe('N');
  });
});

describe('sanitizePairItem', () => {
  it('keeps the stem and statements, drops the mapping key', () => {
    const sanitized = sanitizePairItem(items[0].content);

    expect(sanitized).toEqual({
      question: 'Mana yang lebih Anda pilih?',
      statements: ['E side', 'I side'],
    });
    expect(sanitized).not.toHaveProperty('mapping');
  });

  it('returns an empty object for content that does not validate', () => {
    expect(sanitizePairItem({ statements: ['only one'] })).toEqual({});
  });
});

describe('PairItemContentSchema', () => {
  it('rejects two statements mapped to the same pole', () => {
    const parsed = PairItemContentSchema.safeParse({
      question: 'Pilih',
      statements: ['a', 'b'],
      mapping: ['E', 'E'],
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects identical statements', () => {
    const parsed = PairItemContentSchema.safeParse({
      question: 'Pilih',
      statements: ['sama', 'SAMA'],
      mapping: ['E', 'I'],
    });

    expect(parsed.success).toBe(false);
  });

  it('uppercases pole codes so lowercase input still scores', () => {
    const parsed = PairItemContentSchema.safeParse({
      question: 'Pilih',
      statements: ['a', 'b'],
      mapping: ['e', 'i'],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.mapping).toEqual(['E', 'I']);
  });
});

describe('pairPatternCodes', () => {
  it('returns the cartesian product of four dichotomies', () => {
    const codes = pairPatternCodes(items);

    expect(codes).toHaveLength(16);
    expect(codes).toContain('ESTJ');
    expect(codes).toContain('INFP');
    expect(new Set(codes).size).toBe(16);
  });

  it('returns nothing when no item validates', () => {
    expect(pairPatternCodes([{ content: { statements: [] } }])).toEqual([]);
  });
});
