import { scoreRightWrongNorm } from '../right-wrong-norm';
import { SCORERS } from '../registry';

describe('RightWrongNormScorer (T1)', () => {
  it('scores raw correctly', () => {
    const items = [
      { id: 'i1', content: { question: 'Q1', options: ['a', 'b'], correctIndex: 1 } },
      { id: 'i2', content: { question: 'Q2', options: ['a', 'b'], correctIndex: 0 } },
      { id: 'i3', content: { question: 'Q3', options: ['a', 'b'], correctIndex: 0 } },
    ] as never;
    const responses = [
      { itemId: 'i1', value: { chosen: 1 } },
      { itemId: 'i2', value: { chosen: 1 } },
      { itemId: 'i3', value: { chosen: 0 } },
    ] as never;
    const out = scoreRightWrongNorm({ items, responses });
    expect(out.scores).toEqual({ raw: 2, total: 3, perItem: [true, false, true] });
    expect(out.patternCode).toBe('RAW_2');
  });

  it('sanitize strips correctIndex', () => {
    const scorer = SCORERS.RIGHT_WRONG_NORM;
    expect(
      scorer.sanitize({ question: 'Q1', options: ['a', 'b'], correctIndex: 0 }),
    ).toEqual({ question: 'Q1', options: ['a', 'b'] });
    expect(
      scorer.sanitize({ imageUrl: '/uploads/test-items/x.png', options: ['a', 'b'], correctIndex: 1 }),
    ).toEqual({ imageUrl: '/uploads/test-items/x.png', options: ['a', 'b'] });
  });

  it('validates item and response schemas', () => {
    const scorer = SCORERS.RIGHT_WRONG_NORM;
    expect(scorer.itemSchema.safeParse({ options: ['a', 'b'], correctIndex: 0 }).success).toBe(false);
    expect(
      scorer.itemSchema.safeParse({ question: 'Q1', options: ['a', 'b'], correctIndex: 0 }).success,
    ).toBe(true);
    expect(
      scorer.itemSchema.safeParse({ imageUrl: '/uploads/x.png', options: ['a', 'b'], correctIndex: 0 })
        .success,
    ).toBe(true);
    expect(scorer.itemSchema.safeParse({ question: 'Q1', options: ['a'], correctIndex: 0 }).success).toBe(
      false,
    );
    expect(scorer.itemSchema.safeParse({ question: 'Q1', options: ['a', 'b'], correctIndex: 2 }).success).toBe(
      false,
    );
    expect(scorer.responseSchema.safeParse({ chosen: 0 }).success).toBe(true);
    expect(scorer.responseSchema.safeParse({ chosen: 6 }).success).toBe(false);
  });

  it('pattern catalog is 101', () => {
    const scorer = SCORERS.RIGHT_WRONG_NORM;
    expect(scorer.patternCatalog).toHaveLength(101);
    expect(scorer.patternCatalog[0]).toBe('RAW_0');
    expect(scorer.patternCatalog[100]).toBe('RAW_100');
  });
});
