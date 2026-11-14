import {
  RankGroupItemContentSchema,
  RankGroupResponseSchema,
  rankGroupPatternCodes,
  rankGroupResponseSchema,
  rankGroupScales,
} from '../schemas/rank-group';
import { scoreRankGroup } from '../rank-group';
import { sanitizeRankGroupItem } from '../sanitize-rank-group-item';
import { SCORERS, getResponseSchema } from '../registry';

/** One group of four occupations, each scoring a different field. */
function group(order: number, fields = ['OUT', 'ME', 'COMP', 'SCI']) {
  return {
    id: `item-${order}`,
    content: {
      question: `Kelompok ${order}`,
      options: fields.map((field) => `kerja ${field} ${order}`),
      femaleOptions: fields.map((field) => `kerja wanita ${field} ${order}`),
      mapping: fields,
    },
  };
}

const ITEMS = [group(1), group(2), group(3)];

/** 1 = most liked, 4 = least liked. */
function ranks(itemId: string, values: number[]) {
  return { itemId, value: { ranks: values } };
}

describe('RANK_GROUP item content', () => {
  it('accepts a group with one field per option', () => {
    expect(
      RankGroupItemContentSchema.safeParse({
        question: 'Kelompok A',
        options: ['Petani', 'Insinyur sipil'],
        mapping: ['out', 'me'],
      }).success,
    ).toBe(true);
  });

  it('uppercases the field codes, dot included', () => {
    const parsed = RankGroupItemContentSchema.parse({
      options: ['a', 'b'],
      mapping: ['s.s', 'cler'],
    });
    expect(parsed.mapping).toEqual(['S.S', 'CLER']);
  });

  it('requires one field per option', () => {
    const short = RankGroupItemContentSchema.safeParse({
      options: ['a', 'b', 'c'],
      mapping: ['OUT', 'ME'],
    });
    expect(short.success).toBe(false);
    expect(
      short.error?.issues.some((issue) =>
        issue.message.includes('one scale per option'),
      ),
    ).toBe(true);
  });

  it('requires the female list to line up with the male list', () => {
    const skewed = RankGroupItemContentSchema.safeParse({
      options: ['a', 'b'],
      femaleOptions: ['a'],
      mapping: ['OUT', 'ME'],
    });
    expect(skewed.success).toBe(false);
    expect(
      skewed.error?.issues.some((issue) =>
        issue.message.includes('same length'),
      ),
    ).toBe(true);
  });

  it('rejects a group with a single option', () => {
    expect(
      RankGroupItemContentSchema.safeParse({
        options: ['a'],
        mapping: ['OUT'],
      }).success,
    ).toBe(false);
  });
});

describe('RANK_GROUP response schema', () => {
  it('bounds the numbers by the family maximum', () => {
    expect(RankGroupResponseSchema.safeParse({ ranks: [1, 2] }).success).toBe(
      true,
    );
    expect(RankGroupResponseSchema.safeParse({ ranks: [1, 13] }).success).toBe(
      false,
    );
    expect(RankGroupResponseSchema.safeParse({ ranks: [1, 1.5] }).success).toBe(
      false,
    );
  });

  it('sizes the answer from the item, not the family', () => {
    const schema = rankGroupResponseSchema({
      options: ['a', 'b', 'c', 'd'],
      mapping: ['OUT', 'ME', 'COMP', 'SCI'],
    });

    expect(schema.safeParse({ ranks: [4, 3, 2, 1] }).success).toBe(true);
    expect(schema.safeParse({ ranks: [1, 2, 3] }).success).toBe(false);
    expect(schema.safeParse({ ranks: [1, 2, 3, 4, 1] }).success).toBe(false);
  });

  it('demands each rank exactly once', () => {
    const schema = rankGroupResponseSchema({
      options: ['a', 'b', 'c'],
      mapping: ['OUT', 'ME', 'COMP'],
    });

    expect(schema.safeParse({ ranks: [1, 1, 3] }).success).toBe(false);
    expect(schema.safeParse({ ranks: [1, 2, 2] }).success).toBe(false);
    expect(schema.safeParse({ ranks: [1, 2, 3] }).success).toBe(true);
  });

  it('is wired through the registry with the item content', () => {
    const schema = getResponseSchema(
      SCORERS.RANK_GROUP,
      null,
      ITEMS[0].content,
    );
    expect(schema.safeParse({ ranks: [1, 2, 3, 4] }).success).toBe(true);
    expect(schema.safeParse({ ranks: [1, 2, 3] }).success).toBe(false);
  });
});

describe('sanitizeRankGroupItem', () => {
  const content = ITEMS[0].content;

  it('strips the field key and ships the male list by default', () => {
    expect(sanitizeRankGroupItem(content)).toEqual({
      question: 'Kelompok 1',
      options: content.options,
    });
  });

  it('ships the female list when the attempt recorded FEMALE', () => {
    expect(sanitizeRankGroupItem(content, null, { gender: 'FEMALE' })).toEqual({
      question: 'Kelompok 1',
      options: content.femaleOptions,
    });
  });

  it('falls back to the first list when the item has no female variant', () => {
    expect(
      sanitizeRankGroupItem(
        { options: ['a', 'b'], mapping: ['OUT', 'ME'] },
        null,
        { gender: 'FEMALE' },
      ),
    ).toEqual({ question: undefined, options: ['a', 'b'] });
  });

  it('returns an empty object for content that is not a group', () => {
    expect(sanitizeRankGroupItem({ options: ['a'] })).toEqual({});
  });
});

describe('RANK_GROUP scales', () => {
  it('collects the fields in first-appearance order', () => {
    expect(rankGroupScales(ITEMS)).toEqual(['OUT', 'ME', 'COMP', 'SCI']);
  });

  it('offers every field as a pattern code', () => {
    expect(rankGroupPatternCodes(ITEMS)).toEqual(['OUT', 'ME', 'COMP', 'SCI']);
    expect(SCORERS.RANK_GROUP.patternCatalog).toEqual([]);
  });
});

describe('scoreRankGroup', () => {
  it('sums the rank each field received', () => {
    const { scores } = scoreRankGroup({
      items: ITEMS,
      responses: [
        ranks('item-1', [1, 2, 3, 4]),
        ranks('item-2', [1, 2, 3, 4]),
        ranks('item-3', [1, 2, 3, 4]),
      ],
    });

    // OUT was ranked first everywhere: 1 + 1 + 1.
    expect(scores.scales.OUT.score).toBe(3);
    expect(scores.scales.OUT.min).toBe(3);
    expect(scores.scales.OUT.max).toBe(12);
    expect(scores.scales.OUT.percent).toBe(100);
    expect(scores.scales.SCI.score).toBe(12);
    expect(scores.scales.SCI.percent).toBe(0);
    expect(scores.answered).toBe(3);
    expect(scores.total).toBe(3);
  });

  it('reports the top three fields as the type and the strongest as the code', () => {
    const { scores, patternCode } = scoreRankGroup({
      items: ITEMS,
      responses: [
        ranks('item-1', [4, 3, 2, 1]),
        ranks('item-2', [4, 3, 2, 1]),
        ranks('item-3', [4, 3, 2, 1]),
      ],
    });

    expect(scores.type).toBe('SCI_COMP_ME');
    expect(scores.dominant).toBe('SCI');
    expect(patternCode).toBe('SCI');
  });

  it('breaks a tie with the first field in item order', () => {
    const { scores } = scoreRankGroup({ items: ITEMS, responses: [] });
    expect(scores.type).toBe('OUT_ME_COMP');
    expect(scores.dominant).toBe('OUT');
  });

  it('skips a half-filled or repeated ranking whole', () => {
    const { scores } = scoreRankGroup({
      items: ITEMS,
      responses: [
        ranks('item-1', [1, 2, 3]),
        ranks('item-2', [1, 1, 3, 4]),
        ranks('item-3', [4, 3, 2, 1]),
      ],
    });

    expect(scores.answered).toBe(1);
    expect(scores.scales.OUT.score).toBe(4);
  });

  it('ignores a response for an item that is not in the test', () => {
    const { scores } = scoreRankGroup({
      items: ITEMS,
      responses: [ranks('ghost', [1, 2, 3, 4])],
    });
    expect(scores.answered).toBe(0);
  });

  it('normalises per field, so a field with more groups still compares', () => {
    const uneven = [group(1, ['OUT', 'ME']), group(2, ['OUT', 'COMP'])];
    const { scores } = scoreRankGroup({
      items: uneven,
      responses: [ranks('item-1', [1, 2]), ranks('item-2', [2, 1])],
    });

    // OUT: 1 + 2 = 3 of 2..4 -> 50%. COMP: 1 of 1..2 -> 100%.
    expect(scores.scales.OUT.percent).toBe(50);
    expect(scores.scales.COMP.percent).toBe(100);
    expect(scores.dominant).toBe('COMP');
  });
});
