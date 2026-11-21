import { scoreRightWrongNorm } from '../right-wrong-norm';
import { SCORERS } from '../registry';
import { answersMatch, sameIndexSet } from '../utils/answer-match';

const IMG = '/uploads/test-items/550e8400-e29b-41d4-a716-446655440000.png';

describe('RightWrongNormScorer', () => {
  describe('choice items', () => {
    it('scores raw correctly', () => {
      const items = [
        {
          id: 'i1',
          content: { question: 'Q1', options: ['a', 'b'], correctIndexes: [1] },
        },
        {
          id: 'i2',
          content: { question: 'Q2', options: ['a', 'b'], correctIndexes: [0] },
        },
        {
          id: 'i3',
          content: { question: 'Q3', options: ['a', 'b'], correctIndexes: [0] },
        },
      ];
      const responses = [
        { itemId: 'i1', value: { chosen: 1 } },
        { itemId: 'i2', value: { chosen: 1 } },
        { itemId: 'i3', value: { chosen: 0 } },
      ];
      const out = scoreRightWrongNorm({ items, responses });
      expect(out.scores).toEqual({
        raw: 2,
        total: 3,
        perItem: [true, false, true],
      });
      expect(out.patternCode).toBe('RAW_2');
    });

    it('reads the pre-2026-11 shape', () => {
      const items = [
        {
          id: 'i1',
          content: { question: 'Q1', options: ['a', 'b'], correctIndex: 1 },
        },
      ];
      const out = scoreRightWrongNorm({
        items,
        responses: [{ itemId: 'i1', value: { chosen: 1 } }],
      });
      expect(out.scores.raw).toBe(1);
    });

    it('accepts a multi-key answer in any order', () => {
      const items = [
        {
          id: 'i1',
          content: {
            question: 'Q',
            options: ['a', 'b', 'c', 'd', 'e'],
            correctIndexes: [1, 4],
          },
        },
      ];
      const right = [{ itemId: 'i1', value: { chosen: [4, 1] } }];
      const partial = [{ itemId: 'i1', value: { chosen: [1] } }];
      expect(scoreRightWrongNorm({ items, responses: right }).scores.raw).toBe(
        1,
      );
      expect(
        scoreRightWrongNorm({ items, responses: partial }).scores.raw,
      ).toBe(0);
    });

    it('stores an emptied selection and scores it as wrong', () => {
      // Unticking the last option of a multi-key item sends `chosen: []`.
      // It used to be rejected as a 422, which left the participant unable to
      // finish the attempt.
      const parsed = SCORERS.RIGHT_WRONG_NORM.responseSchema.safeParse({
        chosen: [],
      });
      expect(parsed.success).toBe(true);

      const items = [
        {
          id: 'i1',
          content: {
            question: 'Q',
            options: ['a', 'b', 'c'],
            correctIndexes: [1],
          },
        },
      ];
      const out = scoreRightWrongNorm({
        items,
        responses: [{ itemId: 'i1', value: { chosen: [] } }],
      });
      expect(out.scores.raw).toBe(0);
      expect(out.scores.perItem).toEqual([false]);
    });
  });

  describe('short-answer items', () => {
    const items = [
      {
        id: 's1',
        content: {
          answerMode: 'short',
          question: 'Berapa harga 4 kotak?',
          accepted: ['92', 'Rp 92'],
        },
      },
    ];

    it('matches any accepted variant', () => {
      for (const text of ['92', 'rp92', ' Rp 92 ']) {
        const out = scoreRightWrongNorm({
          items,
          responses: [{ itemId: 's1', value: { text } }],
        });
        expect(out.scores.raw).toBe(1);
      }
    });

    it('treats a wrong or blank answer as wrong', () => {
      const wrong = [{ itemId: 's1', value: { text: '93' } }];
      expect(scoreRightWrongNorm({ items, responses: wrong }).scores.raw).toBe(
        0,
      );
      expect(scoreRightWrongNorm({ items, responses: [] }).scores.raw).toBe(0);
    });
  });

  describe('norm table', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: 'i' + i,
      content: { question: 'Q', options: ['a', 'b'], correctIndexes: [0] },
    }));
    const responses = items.map((item) => ({
      itemId: item.id,
      value: { chosen: 0 },
    }));
    const normTable = [
      { raw: 0, iq: 59 },
      { raw: 29, iq: 118 },
      { raw: 30, iq: 120 },
    ];

    it('converts raw to IQ', () => {
      const out = scoreRightWrongNorm({ items, responses, normTable });
      expect(out.scores.raw).toBe(30);
      expect(out.scores.iq).toBe(120);
    });

    it('omits iq when the test has no norm table', () => {
      expect(
        scoreRightWrongNorm({ items, responses }).scores,
      ).not.toHaveProperty('iq');
    });

    it('falls back to the nearest lower row', () => {
      const out = scoreRightWrongNorm({
        items: items.slice(0, 5),
        responses: responses.slice(0, 5),
        normTable,
      });
      expect(out.scores.raw).toBe(5);
      expect(out.scores.iq).toBe(59);
    });
  });

  describe('sanitize', () => {
    const scorer = SCORERS.RIGHT_WRONG_NORM;

    it('strips the choice key and exposes the mode', () => {
      expect(
        scorer.sanitize({
          question: 'Q1',
          options: ['a', 'b'],
          correctIndexes: [0],
        }),
      ).toEqual({
        answerMode: 'choice',
        question: 'Q1',
        options: ['a', 'b'],
        multi: false,
      });
    });

    it('flags multi-key items so the runner renders checkboxes', () => {
      const out = scorer.sanitize({
        question: 'Q',
        options: ['a', 'b', 'c'],
        correctIndexes: [0, 2],
      });
      expect(out.multi).toBe(true);
    });

    it('strips accepted variants from a short item', () => {
      expect(
        scorer.sanitize({
          answerMode: 'short',
          question: 'Q',
          accepted: ['ya'],
        }),
      ).toEqual({ answerMode: 'short', question: 'Q' });
    });

    it('reads legacy rows', () => {
      expect(
        scorer.sanitize({
          imageUrl: IMG,
          options: ['a', 'b'],
          correctIndex: 1,
        }),
      ).toEqual({
        answerMode: 'choice',
        imageUrl: IMG,
        options: ['a', 'b'],
        multi: false,
      });
    });
  });

  describe('validation', () => {
    const scorer = SCORERS.RIGHT_WRONG_NORM;
    const ok = (v: unknown) => scorer.itemSchema.safeParse(v).success;

    it('requires a question or an image', () => {
      expect(ok({ options: ['a', 'b'], correctIndexes: [0] })).toBe(false);
      expect(
        ok({ question: 'Q', options: ['a', 'b'], correctIndexes: [0] }),
      ).toBe(true);
      expect(
        ok({ imageUrl: IMG, options: ['a', 'b'], correctIndexes: [0] }),
      ).toBe(true);
    });

    it('rejects an external image url', () => {
      const bad = {
        imageUrl: '/uploads/x.png',
        options: ['a', 'b'],
        correctIndexes: [0],
      };
      expect(ok(bad)).toBe(false);
    });

    it('accepts an eight-option grid but not a ninth', () => {
      const eight = ['1', '2', '3', '4', '5', '6', '7', '8'];
      expect(ok({ question: 'Q', options: eight, correctIndexes: [7] })).toBe(
        true,
      );
      expect(
        ok({ question: 'Q', options: [...eight, '9'], correctIndexes: [7] }),
      ).toBe(false);
    });

    it('rejects a key outside the options', () => {
      expect(
        ok({ question: 'Q', options: ['a', 'b'], correctIndexes: [2] }),
      ).toBe(false);
      expect(ok({ question: 'Q', options: ['a'], correctIndexes: [0] })).toBe(
        false,
      );
    });

    it('requires accepted variants for a short item', () => {
      expect(ok({ answerMode: 'short', question: 'Q' })).toBe(false);
      expect(ok({ answerMode: 'short', question: 'Q', accepted: ['ya'] })).toBe(
        true,
      );
    });

    it('validates the response shape', () => {
      expect(scorer.responseSchema.safeParse({ chosen: 0 }).success).toBe(true);
      expect(scorer.responseSchema.safeParse({ chosen: [1, 3] }).success).toBe(
        true,
      );
      expect(scorer.responseSchema.safeParse({ chosen: 8 }).success).toBe(
        false,
      );
      expect(scorer.responseSchema.safeParse({ text: 'ya' }).success).toBe(
        true,
      );
      expect(scorer.responseSchema.safeParse({}).success).toBe(false);
    });

    it('pattern catalog is 101', () => {
      expect(scorer.patternCatalog).toHaveLength(101);
      expect(scorer.patternCatalog[0]).toBe('RAW_0');
      expect(scorer.patternCatalog[100]).toBe('RAW_100');
    });
  });
});

describe('answer matching', () => {
  it('folds case, spaces and comma decimals', () => {
    expect(answersMatch(' 0,125 ', '0.125')).toBe(true);
    expect(answersMatch('TIDAK', 'tidak')).toBe(true);
    expect(answersMatch('.33', '0.33')).toBe(true);
  });

  it('does not guess synonyms', () => {
    expect(answersMatch('tidak', 'no')).toBe(false);
    expect(answersMatch('1,2,4,5', '1,2,4')).toBe(false);
  });

  it('compares choice answers as sets', () => {
    expect(sameIndexSet([4, 1], [1, 4])).toBe(true);
    expect(sameIndexSet([1], [1, 4])).toBe(false);
  });
});
