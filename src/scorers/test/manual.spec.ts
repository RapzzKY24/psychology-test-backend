import {
  MANUAL_MARKS,
  ManualItemContentSchema,
  ManualResponseSchema,
  manualImagePath,
  manualPatternCodes,
} from '../schemas/manual';
import { scoreManual } from '../manual';
import { sanitizeManualItem } from '../sanitize-manual-item';
import { SCORERS } from '../registry';

const ATTEMPT = '6f1c2d3e-4a5b-4c6d-8e7f-901234567890';
const ITEM = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('MANUAL item schema', () => {
  it('accepts every printed mark', () => {
    MANUAL_MARKS.forEach((mark, index) => {
      expect(ManualItemContentSchema.safeParse({ box: index + 1, mark }).success).toBe(
        true,
      );
    });
  });

  it('rejects a box outside 1-8 and an unknown mark', () => {
    expect(
      ManualItemContentSchema.safeParse({ box: 0, mark: 'DOT' }).success,
    ).toBe(false);
    expect(
      ManualItemContentSchema.safeParse({ box: 9, mark: 'DOT' }).success,
    ).toBe(false);
    expect(
      ManualItemContentSchema.safeParse({ box: 1, mark: 'TRIANGLE' }).success,
    ).toBe(false);
  });

  it('rejects a fractional box number', () => {
    expect(
      ManualItemContentSchema.safeParse({ box: 1.5, mark: 'DOT' }).success,
    ).toBe(false);
  });
});

describe('MANUAL response schema', () => {
  it('accepts the path this attempt item is served from', () => {
    const value = { imageUrl: manualImagePath(ATTEMPT, ITEM) };
    expect(ManualResponseSchema.safeParse(value).success).toBe(true);
  });

  it('rejects a bare filename, an absolute URL and a missing key', () => {
    for (const value of [
      { imageUrl: 'drawing.png' },
      { imageUrl: `https://example.com${manualImagePath(ATTEMPT, ITEM)}` },
      { imageUrl: `/uploads/attempt-images/${ATTEMPT}/${ITEM}.png` },
      { imageUrl: 42 },
      {},
    ]) {
      expect({ value, ok: ManualResponseSchema.safeParse(value).success }).toEqual({
        value,
        ok: false,
      });
    }
  });

  it('builds the path from the two ids only', () => {
    expect(manualImagePath(ATTEMPT, ITEM)).toBe(
      `/api/v1/public/attempts/${ATTEMPT}/items/${ITEM}/image`,
    );
  });
});

describe('sanitizeManualItem', () => {
  it('keeps the box and its mark and drops anything else', () => {
    expect(
      sanitizeManualItem({ box: 3, mark: 'BARS', answer: 'secret', key: 7 }),
    ).toEqual({ box: 3, mark: 'BARS' });
  });

  it('returns an empty object for content the schema cannot read', () => {
    expect(sanitizeManualItem({ box: 99, mark: 'BARS' })).toEqual({});
  });
});

describe('scoreManual', () => {
  it('produces no numbers and one fixed code', () => {
    expect(scoreManual()).toEqual({ scores: {}, patternCode: 'MANUAL' });
  });
});

describe('MANUAL registry entry', () => {
  const scorer = SCORERS.MANUAL;

  it('demands an interpretation for no code at all', () => {
    expect(scorer.patternCatalog).toEqual([]);
    expect(manualPatternCodes()).toEqual([]);
    expect(scorer.patternCodesFor?.([], undefined)).toEqual([]);
  });

  it('keeps every score away from the participant', () => {
    expect(scorer.publicScores?.({ drawn: 8 })).toEqual({});
  });

  // The drawings are the answer: a submitted attempt with an empty box has
  // nothing to interpret, so this family is not allowed to skip items.
  it('does not allow blank items', () => {
    expect(scorer.allowsBlank).toBeUndefined();
  });

  it('scores through the registry without touching the responses', async () => {
    const out = await scorer.score({
      items: [{ id: ITEM, content: { box: 1, mark: 'DOT' } }],
      responses: [{ itemId: ITEM, value: { imageUrl: manualImagePath(ATTEMPT, ITEM) } }],
    });
    expect(out).toEqual({ scores: {}, patternCode: 'MANUAL' });
  });
});
