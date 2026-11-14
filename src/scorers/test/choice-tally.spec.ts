import { scoreChoiceTally } from '../choice-tally';
import { sanitizeChoiceTallyItem } from '../sanitize-choice-tally-item';
import {
  ChoiceTallyItemContentSchema,
  choiceTallyPatternCodes,
  choiceTallyScales,
} from '../schemas/choice-tally';

function item(id: string, mapping: string[], question = `${id}?`) {
  return {
    id,
    content: {
      question,
      options: mapping.map((_, i) => `option ${i}`),
      mapping,
    },
  };
}

/** Fifteen items shaped like AQ: each option feeds a different scale. */
const items = Array.from({ length: 15 }, (_, i) =>
  item(`i${i + 1}`, ['Q', 'CA', 'CL']),
);

/** Answers that produce exactly `q` Quitter, `ca` Camper and `cl` Climber. */
function tally(q: number, ca: number, cl: number) {
  const picks = [
    ...Array<number>(q).fill(0),
    ...Array<number>(ca).fill(1),
    ...Array<number>(cl).fill(2),
  ];
  return picks.map((chosen, index) => ({
    itemId: `i${index + 1}`,
    value: { chosen },
  }));
}

describe('ChoiceTallyItemContentSchema', () => {
  it('accepts one scale per option', () => {
    const parsed = ChoiceTallyItemContentSchema.safeParse(
      item('a', ['Q', 'CA', 'CL']).content,
    );
    expect(parsed.success).toBe(true);
  });

  it('uppercases the scales', () => {
    const parsed = ChoiceTallyItemContentSchema.parse(
      item('a', ['q', 'ca', 'cl']).content,
    );
    expect(parsed.mapping).toEqual(['Q', 'CA', 'CL']);
  });

  it('rejects a mapping shorter than the option list', () => {
    const parsed = ChoiceTallyItemContentSchema.safeParse({
      question: 'x',
      options: ['a', 'b', 'c'],
      mapping: ['Q', 'CA'],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('choiceTallyScales', () => {
  it('lists scales in first-appearance order', () => {
    expect(
      choiceTallyScales([item('a', ['CA', 'CL', 'Q']), item('b', ['Q', 'CA'])]),
    ).toEqual(['CA', 'CL', 'Q']);
  });
});

describe('choiceTallyPatternCodes', () => {
  it('offers one code per scale', () => {
    expect(choiceTallyPatternCodes(items)).toEqual(['Q', 'CA', 'CL']);
  });
});

describe('sanitizeChoiceTallyItem', () => {
  it('drops the mapping, which is the key', () => {
    expect(
      sanitizeChoiceTallyItem(item('a', ['Q', 'CA', 'CL']).content),
    ).toEqual({
      question: 'a?',
      options: ['option 0', 'option 1', 'option 2'],
    });
  });

  it('returns an empty object for a malformed item', () => {
    expect(sanitizeChoiceTallyItem({ question: 'x' })).toEqual({});
  });
});

describe('scoreChoiceTally', () => {
  it('counts the picked option scale', () => {
    const out = scoreChoiceTally({
      items,
      responses: [
        { itemId: 'i1', value: { chosen: 0 } },
        { itemId: 'i2', value: { chosen: 1 } },
        { itemId: 'i3', value: { chosen: 2 } },
      ],
    });

    expect(out.scores.scales.Q.score).toBe(1);
    expect(out.scores.scales.CA.score).toBe(1);
    expect(out.scores.scales.CL.score).toBe(1);
    expect(out.scores.answered).toBe(3);
    expect(out.scores.total).toBe(15);
  });

  it('takes the scale that is strictly ahead', () => {
    const out = scoreChoiceTally({
      items,
      responses: tally(8, 0, 7),
      scoringConfig: { tieBreak: 'CA' },
    });

    expect(out.patternCode).toBe('Q');
    expect(out.scores.type).toBe('Q');
  });

  it('resolves a tie to the configured tie-break, as AQ does', () => {
    // AQ's workbook maps 7/1/7 and 6/3/6 to Camper, not to the tied leader.
    for (const [q, ca, cl] of [
      [7, 1, 7],
      [6, 3, 6],
      [5, 5, 5],
      [6, 6, 3],
    ]) {
      const out = scoreChoiceTally({
        items,
        responses: tally(q, ca, cl),
        scoringConfig: { tieBreak: 'CA' },
      });
      expect({ q, ca, cl, code: out.patternCode }).toEqual({
        q,
        ca,
        cl,
        code: 'CA',
      });
    }
  });

  it('still reports a clear leader when the tie-break is configured', () => {
    const out = scoreChoiceTally({
      items,
      responses: tally(0, 7, 8),
      scoringConfig: { tieBreak: 'CA' },
    });

    expect(out.patternCode).toBe('CL');
  });

  it('falls back to item order when no tie-break is configured', () => {
    const out = scoreChoiceTally({ items, responses: tally(5, 5, 5) });

    expect(out.patternCode).toBe('Q');
  });

  it('ignores a tie-break that names no scale of this test', () => {
    const out = scoreChoiceTally({
      items,
      responses: tally(5, 5, 5),
      scoringConfig: { tieBreak: 'X' },
    });

    expect(out.patternCode).toBe('Q');
  });

  it('ignores a malformed scoring config instead of throwing', () => {
    const out = scoreChoiceTally({
      items,
      responses: tally(5, 5, 5),
      scoringConfig: { tieBreak: 42 },
    });

    expect(out.patternCode).toBe('Q');
  });

  it('skips an answer outside the option list', () => {
    const out = scoreChoiceTally({
      items,
      responses: [{ itemId: 'i1', value: { chosen: 7 } }],
    });

    expect(out.scores.answered).toBe(0);
  });

  it('skips a response that belongs to no item', () => {
    const out = scoreChoiceTally({
      items,
      responses: [{ itemId: 'ghost', value: { chosen: 0 } }],
    });

    expect(out.scores.answered).toBe(0);
  });

  it('returns an empty code when the test has no valid items', () => {
    const out = scoreChoiceTally({ items: [], responses: [] });

    expect(out.scores.type).toBe('');
    expect(out.patternCode).toBe('');
  });
});
