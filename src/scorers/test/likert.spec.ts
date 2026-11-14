import {
  DEFAULT_RATING_RANGE,
  LikertConfigSchema,
  LikertItemContentSchema,
  LikertResponseSchema,
  bandCode,
  likertPatternCodes,
  likertResponseSchema,
  likertScales,
  parseLikertConfig,
} from '../schemas/likert';
import { scoreLikert } from '../likert';
import { sanitizeLikertItem } from '../sanitize-likert-item';

/** A five-item scale, two items reversed, 1–5 ratings. */
function items() {
  const specs: [string, string, boolean?][] = [
    ['Saya suka berbicara dengan orang baru', 'E'],
    ['Saya lebih suka menyendiri', 'E', true],
    ['Saya memikirkan orang lain lebih dulu', 'A'],
    ['Saya mudah tersinggung', 'A', true],
    ['Saya menyelesaikan pekerjaan tepat waktu', 'C'],
    ['Saya sering menunda pekerjaan', 'C', true],
    ['Saya mudah cemas', 'N'],
    ['Saya tetap tenang saat tertekan', 'N', true],
    ['Saya suka gagasan baru', 'O'],
  ];
  return specs.map(([text, scale, reverse], index) => ({
    id: `item-${index + 1}`,
    content: { text, scale, ...(reverse ? { reverse: true } : {}) },
  }));
}

/** One response per item, in order. */
function ratings(values: number[]) {
  return values.map((rating, index) => ({
    itemId: `item-${index + 1}`,
    value: { rating },
  }));
}

const BANDS = [
  { max: 33, label: 'Rendah' },
  { max: 66, label: 'Sedang' },
  { max: 100, label: 'Tinggi' },
];

describe('LIKERT item content', () => {
  it('accepts a statement with a scale and an optional reverse flag', () => {
    expect(
      LikertItemContentSchema.safeParse({
        text: 'Saya suka bergaul',
        scale: 'e',
      }).success,
    ).toBe(true);
    expect(
      LikertItemContentSchema.safeParse({
        text: 'Saya lebih suka sendiri',
        scale: 'E',
        reverse: true,
      }).success,
    ).toBe(true);
  });

  it('accepts a numbered type code, so Enneagram can use T1..T9', () => {
    expect(
      LikertItemContentSchema.parse({ text: 'Saya suka bergaul', scale: 't1' }),
    ).toEqual({ text: 'Saya suka bergaul', scale: 'T1' });
  });

  it('rejects an empty statement or a scale that does not start with a letter', () => {
    expect(
      LikertItemContentSchema.safeParse({ text: '', scale: 'E' }).success,
    ).toBe(false);
    expect(
      LikertItemContentSchema.safeParse({
        text: 'Saya suka bergaul',
        scale: '1',
      }).success,
    ).toBe(false);
    expect(
      LikertItemContentSchema.safeParse({
        text: 'Saya suka bergaul',
        scale: 'T-1',
      }).success,
    ).toBe(false);
  });

  it('rejects a rating no inventory would use', () => {
    expect(LikertResponseSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(LikertResponseSchema.safeParse({ rating: 11 }).success).toBe(false);
    expect(LikertResponseSchema.safeParse({ rating: 3.5 }).success).toBe(false);
  });
});

describe('LIKERT scales and pattern codes', () => {
  it('collects scales in first-appearance order', () => {
    expect(likertScales(items())).toEqual(['E', 'A', 'C', 'N', 'O']);
  });

  it('keeps a numbered scale as its own code', () => {
    const enneagram = [
      { content: { text: 'a', scale: 'T3' } },
      { content: { text: 'b', scale: 'T1' } },
      { content: { text: 'c', scale: 'T3' } },
    ];
    expect(likertScales(enneagram)).toEqual(['T3', 'T1']);
    expect(likertPatternCodes(enneagram)).toEqual(['T3', 'T1']);
  });

  it('returns the bare scales when the test declares no bands', () => {
    expect(likertPatternCodes(items())).toEqual(['E', 'A', 'C', 'N', 'O']);
  });

  it('crosses every scale with every band when bands are declared', () => {
    const codes = likertPatternCodes(items(), { bands: BANDS });
    expect(codes).toHaveLength(15);
    expect(codes.slice(0, 3)).toEqual(['E_RENDAH', 'E_SEDANG', 'E_TINGGI']);
    expect(codes).toContain('O_TINGGI');
  });

  it('normalizes a multi-word band label into one code token', () => {
    expect(bandCode('Sangat Tinggi')).toBe('SANGAT_TINGGI');
    expect(bandCode(' rendah ')).toBe('RENDAH');
  });
});

describe('sanitizeLikertItem', () => {
  it('keeps the statement and the rating scale, drops the key', () => {
    expect(
      sanitizeLikertItem(
        { text: 'Saya suka bergaul', scale: 'E', reverse: true },
        { ratingRange: { min: 1, max: 7 } },
      ),
    ).toEqual({ text: 'Saya suka bergaul', min: 1, max: 7 });
  });

  it('falls back to 1–5 when the test carries no range', () => {
    expect(
      sanitizeLikertItem({ text: 'Saya suka bergaul', scale: 'E' }),
    ).toEqual({ text: 'Saya suka bergaul', min: 1, max: 5 });
  });

  it('returns an empty object for content that is not a Likert item', () => {
    expect(sanitizeLikertItem({ question: 'bukan likert' })).toEqual({});
  });

  it('ships the meaning of each point when the test declares labels', () => {
    expect(
      sanitizeLikertItem(
        { text: 'Saya suka bergaul', scale: 'T1' },
        {
          ratingRange: { min: 0, max: 3 },
          ratingLabels: [
            'Tidak sama sekali',
            'Agak',
            'Cukup baik',
            'Sangat baik',
          ],
        },
      ),
    ).toEqual({
      text: 'Saya suka bergaul',
      min: 0,
      max: 3,
      labels: ['Tidak sama sekali', 'Agak', 'Cukup baik', 'Sangat baik'],
    });
  });

  it('omits labels when the test declares none', () => {
    const sanitized = sanitizeLikertItem(
      { text: 'Saya suka bergaul', scale: 'E' },
      { ratingRange: { min: 1, max: 5 } },
    );
    expect(sanitized).not.toHaveProperty('labels');
  });
});

describe('LikertConfigSchema', () => {
  it('accepts a label for every point of the scale', () => {
    expect(
      LikertConfigSchema.safeParse({
        ratingRange: { min: 0, max: 3 },
        ratingLabels: ['a', 'b', 'c', 'd'],
      }).success,
    ).toBe(true);
  });

  it('counts the labels against the effective range', () => {
    // 1-5 by default, so three labels are one short.
    const short = LikertConfigSchema.safeParse({
      ratingLabels: ['a', 'b', 'c'],
    });
    expect(short.success).toBe(false);
    expect(
      short.error?.issues.some((issue) =>
        issue.message.includes('must have 5 labels'),
      ),
    ).toBe(true);
  });
});

describe('scoreLikert', () => {
  it('sums the ratings of each scale', () => {
    const { scores } = scoreLikert({
      items: items(),
      responses: ratings([5, 1, 4, 2, 5, 1, 3, 3, 4]),
    });

    expect(scores.answered).toBe(9);
    expect(scores.total).toBe(9);
    expect(scores.scales.E.score).toBe(10);
    expect(scores.scales.A.score).toBe(8);
    expect(scores.scales.C.score).toBe(10);
    expect(scores.scales.N.score).toBe(6);
    expect(scores.scales.O.score).toBe(4);
  });

  it('flips a reverse-keyed rating before adding it', () => {
    // 1 on the reversed item is a 5, not a 1.
    const { scores } = scoreLikert({
      items: items(),
      responses: [{ itemId: 'item-2', value: { rating: 1 } }],
    });
    expect(scores.scales.E.score).toBe(5);
  });

  it('leaves the flipped value inside the rating range at both ends', () => {
    const { scores } = scoreLikert({
      items: items(),
      responses: [
        { itemId: 'item-2', value: { rating: 5 } },
        { itemId: 'item-2', value: { rating: 1 } },
      ],
    });
    // Two responses for one item: both count, 1 + 5 = 6.
    expect(scores.scales.E.score).toBe(6);
  });

  it('computes max from the item count and the top rating', () => {
    const { scores } = scoreLikert({ items: items(), responses: [] });
    expect(scores.scales.E.max).toBe(10);
    expect(scores.scales.A.max).toBe(10);
    expect(scores.scales.O.max).toBe(5);
  });

  it('uses percent, not the raw sum, to pick the winning scale', () => {
    // E: 10/10 = 100%; A: 9/10 = 90%. Both scales hold two items, so the raw
    // sums are close — the winner must follow the percentage.
    const twoScales = [
      { id: 'e1', content: { text: 'E1', scale: 'E' } },
      { id: 'e2', content: { text: 'E2', scale: 'E' } },
      { id: 'a1', content: { text: 'A1', scale: 'A' } },
      { id: 'a2', content: { text: 'A2', scale: 'A' } },
    ];
    const { scores, patternCode } = scoreLikert({
      items: twoScales,
      responses: [
        { itemId: 'e1', value: { rating: 5 } },
        { itemId: 'e2', value: { rating: 5 } },
        { itemId: 'a1', value: { rating: 5 } },
        { itemId: 'a2', value: { rating: 4 } },
      ],
    });
    expect(scores.scales.E.percent).toBe(100);
    expect(scores.scales.A.percent).toBe(90);
    expect(scores.type).toBe('E');
    expect(patternCode).toBe('E');
  });

  it('breaks a tie with the first scale in item order', () => {
    const { scores } = scoreLikert({ items: items(), responses: [] });
    expect(scores.type).toBe('E');
  });

  it('applies the band of the winning scale', () => {
    const { scores, patternCode } = scoreLikert({
      items: items(),
      responses: ratings([5, 1, 4, 2, 5, 1, 3, 3, 4]),
      scoringConfig: { bands: BANDS },
    });

    expect(scores.scales.E.percent).toBe(100);
    expect(scores.scales.E.band).toBe('Tinggi');
    expect(scores.scales.O.percent).toBe(80);
    expect(scores.scales.O.band).toBe('Tinggi');
    expect(patternCode).toBe('E_TINGGI');
  });

  it('treats the last band as the catch-all, like the workbook', () => {
    const { scores } = scoreLikert({
      items: items(),
      responses: ratings([5, 5, 0, 0, 0, 0, 0, 0, 0]),
      scoringConfig: { bands: [{ max: 33, label: 'Rendah' }] },
    });
    // 100% is above the only row, so it falls through to the last band.
    expect(scores.scales.E.band).toBe('Rendah');
  });

  it('cuts the band on the exact ratio, not the rounded percent', () => {
    // 15/45 = 33.33% prints as 33 but belongs to "Sedang".
    const nine = Array.from({ length: 9 }, (_, i) => ({
      id: `c${i + 1}`,
      content: { text: `C${i + 1}`, scale: 'C' },
    }));
    const { scores } = scoreLikert({
      items: nine,
      responses: nine.map((item, i) => ({
        itemId: item.id,
        value: { rating: i < 3 ? 5 : 0 },
      })),
      scoringConfig: { bands: BANDS },
    });
    expect(scores.scales.C.score).toBe(15);
    expect(scores.scales.C.percent).toBe(33);
    expect(scores.scales.C.band).toBe('Sedang');
  });

  it('honours a 0–3 rating range', () => {
    const { scores } = scoreLikert({
      items: items(),
      responses: ratings([3, 0, 3, 0, 3, 0, 3, 0, 3]),
      scoringConfig: { ratingRange: { min: 0, max: 3 } },
    });
    expect(scores.scales.E.score).toBe(6);
    expect(scores.scales.E.max).toBe(6);
    expect(scores.scales.E.percent).toBe(100);
  });

  it('ignores a rating outside the configured range', () => {
    const { scores } = scoreLikert({
      items: items(),
      responses: [{ itemId: 'item-1', value: { rating: 9 } }],
    });
    expect(scores.answered).toBe(0);
    expect(scores.scales.E.score).toBe(0);
  });

  it('ignores a response for an item that is not in the test', () => {
    const { scores } = scoreLikert({
      items: items(),
      responses: [{ itemId: 'ghost', value: { rating: 5 } }],
    });
    expect(scores.answered).toBe(0);
  });

  it('defaults to a 1–5 range when the config is missing', () => {
    const config = parseLikertConfig(null);
    expect(config.ratingRange).toBeUndefined();
    expect(DEFAULT_RATING_RANGE).toEqual({ min: 1, max: 5 });
  });
});

describe('likertResponseSchema', () => {
  it('bounds the rating by the test range instead of the family range', () => {
    const schema = likertResponseSchema({
      ratingRange: { min: 1, max: 5 },
    });

    expect(schema.safeParse({ rating: 1 }).success).toBe(true);
    expect(schema.safeParse({ rating: 5 }).success).toBe(true);
    expect(schema.safeParse({ rating: 0 }).success).toBe(false);
    expect(schema.safeParse({ rating: 6 }).success).toBe(false);
  });

  it('says which bound it broke', () => {
    const schema = likertResponseSchema({ ratingRange: { min: 0, max: 3 } });

    expect(schema.safeParse({ rating: 4 }).error?.issues[0].message).toBe(
      'rating must be at most 3',
    );
    expect(schema.safeParse({ rating: -1 }).error?.issues[0].message).toBe(
      'rating must be at least 0',
    );
  });

  it('falls back to 1–5 when the test carries no range', () => {
    for (const config of [null, undefined, {}, { bands: [] }]) {
      const schema = likertResponseSchema(config);
      expect(schema.safeParse({ rating: 5 }).success).toBe(true);
      expect(schema.safeParse({ rating: 6 }).success).toBe(false);
    }
  });

  it('still rejects a non-integer or a missing rating', () => {
    const schema = likertResponseSchema(undefined);

    expect(schema.safeParse({ rating: 3.5 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});
