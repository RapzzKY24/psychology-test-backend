import { scoreOptionScale } from '../option-scale';
import { sanitizeOptionScaleItem } from '../sanitize-option-scale-item';
import { optionScaleResponseSchema } from '../schemas/option-scale';

const ITEMS = [
  {
    id: 'i1',
    content: {
      text: 'Saya merasa ingatan saya jauh lebih baik dari sebelumnya.',
      options: ['Ya', 'Di antaranya', 'Tidak'],
      scale: 'MD',
    },
  },
  {
    id: 'i2',
    content: {
      text: 'Dengan hidup menyendiri, saya merasa bahagia.',
      options: ['Ya', 'Kadang-kadang', 'Tidak'],
      scale: 'A',
      reverse: true,
    },
  },
  {
    id: 'i3',
    content: {
      text: 'Saya suka bekerja dalam kelompok.',
      options: ['Ya', 'Kadang-kadang', 'Tidak'],
      scale: 'A',
    },
  },
];

/** raw 0-4, sten 1-10, two groups so the fallback can be observed. */
const NORM_ROWS = [
  ...[0, 1, 2, 3, 4].map((raw) => ({
    group: 'S1_L',
    scale: 'MD',
    rawMin: raw,
    rawMax: raw,
    outputValue: Math.min(raw * 2 + 1, 10),
    outputLabel: null,
  })),
  ...[0, 1, 2, 3, 4].map((raw) => ({
    group: 'S1_L',
    scale: 'A',
    rawMin: raw,
    rawMax: raw,
    outputValue: Math.min(raw * 2, 10),
    outputLabel: null,
  })),
  ...[0, 1, 2, 3, 4].map((raw) => ({
    group: 'S1_LP',
    scale: 'MD',
    rawMin: raw,
    rawMax: raw,
    outputValue: 9,
    outputLabel: null,
  })),
  ...[0, 1, 2, 3, 4].map((raw) => ({
    group: 'S1_LP',
    scale: 'A',
    rawMin: raw,
    rawMax: raw,
    outputValue: 8,
    outputLabel: null,
  })),
];

const answers = (...chosen: number[]) =>
  ITEMS.slice(0, chosen.length).map((item, index) => ({
    itemId: item.id,
    value: { chosen: chosen[index] },
  }));

describe('scoreOptionScale', () => {
  it('scores option 0 as the high pole and option 2 as the low pole', () => {
    const { scores } = scoreOptionScale({
      items: ITEMS,
      responses: answers(0, 2, 0),
    });
    expect(scores.scales.MD.score).toBe(2);
    // i2 is reversed, so its last option is the high pole.
    expect(scores.scales.A.score).toBe(2 + 2);
    expect(scores.scales.A.max).toBe(4);
    expect(scores.answered).toBe(3);
  });

  it('flips a reversed item', () => {
    const { scores } = scoreOptionScale({
      items: ITEMS,
      responses: [{ itemId: 'i2', value: { chosen: 0 } }],
    });
    expect(scores.scales.A.score).toBe(0);
  });

  it('reads the sten of the declared norm group', () => {
    const { scores } = scoreOptionScale({
      items: ITEMS,
      responses: answers(1, 2, 0),
      normRows: NORM_ROWS,
      gender: 'MALE',
      education: 'S1',
    });
    expect(scores.normGroup).toBe('S1_L');
    expect(scores.scales.MD.sten).toBe(3);
    // A raw of 4 sits on the last row of the fixture (4 x 2 = 8).
    expect(scores.scales.A.sten).toBe(8);
    expect(scores.stenMax).toBe(10);
  });

  it('falls back to the combined-sex table when no sex was declared', () => {
    const { scores } = scoreOptionScale({
      items: ITEMS,
      responses: answers(1, 2, 0),
      normRows: NORM_ROWS,
      education: 'S1',
    });
    expect(scores.normGroup).toBe('S1_LP');
    expect(scores.scales.MD.sten).toBe(9);
  });

  it('leaves the sten null when no row covers the raw score', () => {
    const { scores } = scoreOptionScale({
      items: ITEMS,
      responses: answers(2, 2, 2),
      normRows: NORM_ROWS,
      gender: 'FEMALE',
      education: 'S1',
    });
    // FEMALE reads S1_P, which the fixture does not ship.
    expect(scores.normGroup).toBe('S1_P');
    expect(scores.scales.MD.sten).toBeNull();
  });

  it('names the factor with the highest sten as the pattern code', () => {
    const { patternCode, scores } = scoreOptionScale({
      items: ITEMS,
      responses: answers(2, 2, 2),
      normRows: NORM_ROWS,
      gender: 'MALE',
      education: 'S1',
    });
    expect(patternCode).toBe('A');
    expect(scores.type).toBe('A');
  });

  it('ignores a pick past the option count', () => {
    const { scores } = scoreOptionScale({
      items: ITEMS,
      responses: [{ itemId: 'i1', value: { chosen: 7 } }],
    });
    expect(scores.scales.MD.score).toBe(0);
    expect(scores.answered).toBe(0);
  });
});

describe('optionScaleResponseSchema', () => {
  it('bounds the pick to the item option count', () => {
    expect(
      optionScaleResponseSchema(ITEMS[0].content).safeParse({ chosen: 2 })
        .success,
    ).toBe(true);
    expect(
      optionScaleResponseSchema(ITEMS[0].content).safeParse({ chosen: 3 })
        .success,
    ).toBe(false);
  });

  it('falls back to three options when the item cannot be parsed', () => {
    expect(
      optionScaleResponseSchema({ nonsense: true }).safeParse({ chosen: 2 })
        .success,
    ).toBe(true);
    expect(
      optionScaleResponseSchema({ nonsense: true }).safeParse({ chosen: 3 })
        .success,
    ).toBe(false);
  });
});

describe('sanitizeOptionScaleItem', () => {
  it('keeps the statement and options, drops the key', () => {
    expect(sanitizeOptionScaleItem(ITEMS[1].content)).toEqual({
      text: 'Dengan hidup menyendiri, saya merasa bahagia.',
      options: ['Ya', 'Kadang-kadang', 'Tidak'],
    });
  });
});
