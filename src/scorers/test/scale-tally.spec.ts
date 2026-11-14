import { scoreScaleTally } from '../scale-tally';
import { sanitizeScaleTallyItem } from '../sanitize-scale-tally-item';
import {
  ScaleTallyItemContentSchema,
  scaleTallyPatternCodes,
  scaleTallyScales,
} from '../schemas/scale-tally';

function item(id: string, scale: string, question = `${scale} statement`) {
  return {
    id,
    content: { question, options: ['Ya', 'Tidak'], scale },
  };
}

/** Six RIASEC scales, two items each, in the order the booklet prints them. */
const items = ['R', 'I', 'A', 'S', 'E', 'C'].flatMap((scale) => [
  item(`${scale}1`, scale),
  item(`${scale}2`, scale),
]);

const pick = (id: string, chosen: number) => ({
  itemId: id,
  value: { chosen },
});

describe('scaleTallyScales', () => {
  it('lists scales in first-appearance order', () => {
    expect(
      scaleTallyScales([item('a', 'S'), item('b', 'R'), item('c', 'S')]),
    ).toEqual(['S', 'R']);
  });

  it('ignores items the schema rejects', () => {
    expect(
      scaleTallyScales([
        item('a', 'R'),
        { content: { question: '', options: ['Ya', 'Tidak'], scale: 'I' } },
      ]),
    ).toEqual(['R']);
  });
});

describe('scaleTallyPatternCodes', () => {
  it('offers one code per scale, because the top scale is the result', () => {
    expect(scaleTallyPatternCodes(items)).toEqual([
      'R',
      'I',
      'A',
      'S',
      'E',
      'C',
    ]);
  });
});

describe('ScaleTallyItemContentSchema', () => {
  it('accepts two options and uppercases the scale', () => {
    const parsed = ScaleTallyItemContentSchema.parse({
      question: 'Senang menonton drama',
      options: ['Ya', 'Tidak'],
      scale: 'a',
    });
    expect(parsed.scale).toBe('A');
  });

  it('rejects a scale that is not a letter code', () => {
    const parsed = ScaleTallyItemContentSchema.safeParse({
      question: 'x',
      options: ['Ya', 'Tidak'],
      scale: '1',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an item without exactly two options', () => {
    const parsed = ScaleTallyItemContentSchema.safeParse({
      question: 'x',
      options: ['Ya'],
      scale: 'R',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('sanitizeScaleTallyItem', () => {
  it('drops the scale, which is the key', () => {
    expect(sanitizeScaleTallyItem(item('a', 'R').content)).toEqual({
      question: 'R statement',
      options: ['Ya', 'Tidak'],
    });
  });

  it('returns an empty object for a malformed item', () => {
    expect(sanitizeScaleTallyItem({ question: 'x' })).toEqual({});
  });
});

describe('scoreScaleTally', () => {
  it('counts a "Ya" (option 0) for the item scale', () => {
    const out = scoreScaleTally({
      items,
      responses: [pick('R1', 0), pick('R2', 0), pick('I1', 0)],
    });

    expect(out.scores.scales.R).toEqual({ score: 2, max: 2, percent: 100 });
    expect(out.scores.scales.I).toEqual({ score: 1, max: 2, percent: 50 });
    expect(out.scores.scales.A).toEqual({ score: 0, max: 2, percent: 0 });
  });

  it('treats a "Tidak" (option 1) as no point, not as a negative one', () => {
    const out = scoreScaleTally({
      items,
      responses: [pick('R1', 1), pick('R2', 1), pick('I1', 0)],
    });

    expect(out.scores.scales.R.score).toBe(0);
    expect(out.scores.scales.I.score).toBe(1);
  });

  it('builds a three-letter code from the strongest scales', () => {
    const out = scoreScaleTally({
      items,
      responses: [
        pick('S1', 0),
        pick('S2', 0),
        pick('E1', 0),
        pick('E2', 0),
        pick('A1', 0),
      ],
    });

    expect(out.scores.type).toBe('SEA');
    expect(out.patternCode).toBe('S');
  });

  it('breaks a tie by item order, so the same answers give the same code', () => {
    // Every scale scores one; R appears first in the booklet.
    const out = scoreScaleTally({
      items,
      responses: ['R', 'I', 'A', 'S', 'E', 'C'].map((s) => pick(`${s}1`, 0)),
    });

    expect(out.scores.type).toBe('RIA');
    expect(out.patternCode).toBe('R');
  });

  it('falls back to the earliest scale when nobody answered', () => {
    const out = scoreScaleTally({ items, responses: [] });

    expect(out.scores.answered).toBe(0);
    expect(out.scores.type).toBe('RIA');
    expect(out.patternCode).toBe('R');
  });

  it('counts only responses that belong to an item', () => {
    const out = scoreScaleTally({
      items,
      responses: [pick('R1', 0), { itemId: 'ghost', value: { chosen: 0 } }],
    });

    expect(out.scores.answered).toBe(1);
    expect(out.scores.total).toBe(12);
  });

  it('ignores an answer outside the two options', () => {
    const out = scoreScaleTally({
      items,
      responses: [pick('R1', 5)],
    });

    expect(out.scores.answered).toBe(0);
    expect(out.scores.scales.R.score).toBe(0);
  });

  it('returns an empty code when the test has no valid items', () => {
    const out = scoreScaleTally({ items: [], responses: [] });

    expect(out.scores.type).toBe('');
    expect(out.patternCode).toBe('');
  });
});
