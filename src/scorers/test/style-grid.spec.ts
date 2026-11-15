import { scoreStyleGrid } from '../style-grid';
import { sanitizeStyleGridItem } from '../sanitize-style-grid-item';
import {
  StyleGridConfigSchema,
  StyleGridItemContentSchema,
  styleGridPatternCodes,
} from '../schemas/style-grid';

/** MSDT's shape: 8 styles, 3 dimensions, one open-ended level row. */
const CONFIG = {
  scales: [
    { code: 'A', label: 'Deserter', correction: 1 },
    { code: 'B', label: 'Missionary', correction: 2 },
    { code: 'C', label: 'Autocrat', correction: 1 },
    { code: 'D', label: 'Compromiser', correction: 0 },
    { code: 'E', label: 'Bureaucrat', correction: 3 },
    { code: 'F', label: 'Developer', correction: -1 },
    { code: 'G', label: 'Benevolent autocrat', correction: 0 },
    { code: 'H', label: 'Executive', correction: -4 },
  ],
  dimensions: [
    { code: 'TO', label: 'Task orientation', scales: ['C', 'D', 'G', 'H'] },
    {
      code: 'RO',
      label: 'Relationship orientation',
      scales: ['B', 'D', 'F', 'H'],
    },
    { code: 'E', label: 'Effectiveness', scales: ['E', 'F', 'G', 'H'] },
    { code: 'O', label: 'Other', scales: ['A'] },
  ],
  levels: [
    { max: 29, value: 0 },
    { max: 31, value: 0.6 },
    { max: 32, value: 1.2 },
    { max: 33, value: 1.8 },
    { max: 34, value: 2.4 },
    { max: 35, value: 3 },
    { max: 37, value: 3.6 },
    { max: null, value: 4 },
  ],
  cut: 2,
  profiles: [
    { code: 'E', label: 'Executive', high: ['TO', 'RO', 'E'], low: [] },
    { code: 'CO', label: 'Compromiser', high: ['TO', 'RO'], low: ['E'] },
    {
      code: 'BA',
      label: 'Benevolent autocrat',
      high: ['TO', 'E'],
      low: ['RO'],
    },
    { code: 'AU', label: 'Autocrat', high: ['TO'], low: ['RO', 'E'] },
    { code: 'DV', label: 'Developer', high: ['RO', 'E'], low: ['TO'] },
    { code: 'MI', label: 'Missionary', high: ['RO'], low: ['TO', 'E'] },
    { code: 'BU', label: 'Bureaucrat', high: ['E'], low: ['TO', 'RO'] },
    { code: 'DS', label: 'Deserter', high: [], low: ['TO', 'RO', 'E'] },
  ],
};

/** One scale per dimension, corrections 0, a single cut — for profile tests. */
const SIMPLE = {
  scales: [{ code: 'T' }, { code: 'R' }, { code: 'E' }, { code: 'X' }],
  dimensions: [
    { code: 'TO', scales: ['T'] },
    { code: 'RO', scales: ['R'] },
    { code: 'EF', scales: ['E'] },
  ],
  levels: [
    { max: 0, value: 0 },
    { max: null, value: 4 },
  ],
  cut: 2,
  profiles: [
    { code: 'E', label: 'Executive', high: ['TO', 'RO', 'EF'], low: [] },
    { code: 'CO', label: 'Compromiser', high: ['TO', 'RO'], low: ['EF'] },
    {
      code: 'BA',
      label: 'Benevolent autocrat',
      high: ['TO', 'EF'],
      low: ['RO'],
    },
    { code: 'AU', label: 'Autocrat', high: ['TO'], low: ['RO', 'EF'] },
    { code: 'DV', label: 'Developer', high: ['RO', 'EF'], low: ['TO'] },
    { code: 'MI', label: 'Missionary', high: ['RO'], low: ['TO', 'EF'] },
    { code: 'BU', label: 'Bureaucrat', high: ['EF'], low: ['TO', 'RO'] },
    { code: 'DS', label: 'Deserter', high: [], low: ['TO', 'RO', 'EF'] },
  ],
};

function item(id: string, mapping: string[]) {
  return {
    id,
    content: {
      statements: [`${id} kiri`, `${id} kanan`],
      mapping,
    },
  };
}

/** 8 items, one per scale, so every scale has a ceiling of 1. */
const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((scale, index) =>
  item(`i${index + 1}`, [scale, scale]),
);

function answerAll(list: { id: string }[], chosen: number) {
  return list.map((entry) => ({ itemId: entry.id, value: { chosen } }));
}

describe('StyleGridItemContentSchema', () => {
  it('accepts an item whose two statements score the same scale', () => {
    expect(
      StyleGridItemContentSchema.safeParse({
        statements: ['kiri', 'kanan'],
        mapping: ['A', 'A'],
      }).success,
    ).toBe(true);
  });

  it('rejects two identical statements', () => {
    expect(
      StyleGridItemContentSchema.safeParse({
        statements: ['sama', 'Sama'],
        mapping: ['A', 'B'],
      }).success,
    ).toBe(false);
  });

  it('uppercases the scale codes', () => {
    const parsed = StyleGridItemContentSchema.parse({
      statements: ['kiri', 'kanan'],
      mapping: ['a', 'h'],
    });
    expect(parsed.mapping).toEqual(['A', 'H']);
  });
});

describe('sanitizeStyleGridItem', () => {
  it('keeps the statements and drops the key', () => {
    expect(
      sanitizeStyleGridItem({
        question: 'Pilih satu.',
        statements: ['kiri', 'kanan'],
        mapping: ['A', 'B'],
      }),
    ).toEqual({ question: 'Pilih satu.', statements: ['kiri', 'kanan'] });
  });

  it('omits an empty question', () => {
    expect(
      sanitizeStyleGridItem({
        statements: ['kiri', 'kanan'],
        mapping: ['A', 'B'],
      }),
    ).toEqual({ statements: ['kiri', 'kanan'] });
  });
});

describe('StyleGridConfigSchema', () => {
  it('accepts the MSDT shape', () => {
    expect(StyleGridConfigSchema.safeParse(CONFIG).success).toBe(true);
  });

  it('rejects a dimension that points at an unknown scale', () => {
    const broken = { ...CONFIG, dimensions: [{ code: 'TO', scales: ['Z'] }] };
    expect(StyleGridConfigSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects rows that are not ordered by max', () => {
    const broken = {
      ...CONFIG,
      levels: [
        { max: 31, value: 0.6 },
        { max: 29, value: 0 },
        { max: null, value: 4 },
      ],
    };
    expect(StyleGridConfigSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an open-ended row that is not last', () => {
    const broken = {
      ...CONFIG,
      levels: [
        { max: null, value: 4 },
        { max: 29, value: 0 },
      ],
    };
    expect(StyleGridConfigSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a profile set that leaves a combination uncovered', () => {
    const broken = {
      ...CONFIG,
      profiles: [{ code: 'X', label: 'X', high: ['TO'], low: [] }],
    };
    expect(StyleGridConfigSchema.safeParse(broken).success).toBe(false);
  });

  it('lets a profile leave a printed dimension out of the pattern', () => {
    // CONFIG has four dimensions but only TO/RO/E choose the style.
    expect(StyleGridConfigSchema.safeParse(CONFIG).success).toBe(true);
  });

  it('rejects duplicate scale codes', () => {
    const broken = {
      ...CONFIG,
      scales: [{ code: 'A' }, { code: 'A' }],
      dimensions: [{ code: 'TO', scales: ['A'] }],
      profiles: [{ code: 'X', label: 'X', high: ['TO'], low: [] }],
    };
    expect(StyleGridConfigSchema.safeParse(broken).success).toBe(false);
  });
});

describe('styleGridPatternCodes', () => {
  it('is one code per declared profile', () => {
    expect(styleGridPatternCodes(CONFIG)).toEqual([
      'E',
      'CO',
      'BA',
      'AU',
      'DV',
      'MI',
      'BU',
      'DS',
    ]);
  });

  it('is empty when the config does not parse', () => {
    expect(styleGridPatternCodes({ scales: [] })).toEqual([]);
  });
});

describe('scoreStyleGrid', () => {
  it('adds each scale correction once', () => {
    const output = scoreStyleGrid({
      items,
      responses: answerAll(items, 0),
      scoringConfig: CONFIG,
    });

    // Every scale picked once; A gets +1, B +2, E +3, F -1, H -4.
    expect(output.scores.scales.A.score).toBe(2);
    expect(output.scores.scales.B.score).toBe(3);
    expect(output.scores.scales.E.score).toBe(4);
    expect(output.scores.scales.F.score).toBe(0);
    expect(output.scores.scales.H.score).toBe(-3);
    expect(output.scores.answered).toBe(8);
    expect(output.scores.total).toBe(8);
  });

  it('counts the picked statement of a same-scale item once', () => {
    const output = scoreStyleGrid({
      items: [item('i1', ['A', 'A'])],
      responses: [{ itemId: 'i1', value: { chosen: 1 } }],
      scoringConfig: CONFIG,
    });
    // One pick, not two: only the chosen statement scores, so the ceiling is
    // one point plus the correction.
    expect(output.scores.scales.A.score).toBe(2);
    expect(output.scores.scales.A.max).toBe(2);
  });

  it('rolls the scales up into dimensions', () => {
    const output = scoreStyleGrid({
      items,
      responses: answerAll(items, 0),
      scoringConfig: CONFIG,
    });

    // TO = C2+D1+G1+H(-3) = 1; RO = B3+D1+F0+H(-3) = 1;
    // E = E4+F0+G1+H(-3) = 2; O = A2.
    expect(output.scores.dimensions.TO.score).toBe(1);
    expect(output.scores.dimensions.RO.score).toBe(1);
    expect(output.scores.dimensions.E.score).toBe(2);
    expect(output.scores.dimensions.O.score).toBe(2);
  });

  it('reads the step table at its boundaries', () => {
    const at = (picks: number) => {
      const many = Array.from({ length: picks }, (_, index) =>
        item(`i${index + 1}`, ['A', 'A']),
      );
      return scoreStyleGrid({
        items: many,
        responses: answerAll(many, 0),
        scoringConfig: CONFIG,
      }).scores.dimensions.O;
    };

    // O is scale A (+1), so 28 picks score 29 and 29 picks score 30.
    expect(at(28)).toEqual({
      label: 'Other',
      score: 29,
      level: 0,
      high: false,
    });
    expect(at(29)).toEqual({
      label: 'Other',
      score: 30,
      level: 0.6,
      high: false,
    });
  });

  it('reproduces the worked example from the source deck', () => {
    // The deck's grid: A per row 4,2,4,2,4,3,5,8 and B per column
    // 3,4,2,5,3,7,2,6, which it scores as JUMLAH 8,8,7,7,10,9,7,10 and
    // TO 0.6 / RO 2.4 / E 3.6 / O 0 — a Developer.
    const answers = grid([4, 2, 4, 2, 4, 3, 5, 8], [3, 4, 2, 5, 3, 7, 2, 6]);

    const output = scoreStyleGrid({
      items: answers.items,
      responses: answers.responses,
      scoringConfig: CONFIG,
    });

    expect(output.scores.scales.A.score).toBe(8);
    expect(output.scores.scales.B.score).toBe(8);
    expect(output.scores.scales.C.score).toBe(7);
    expect(output.scores.scales.D.score).toBe(7);
    expect(output.scores.scales.E.score).toBe(10);
    expect(output.scores.scales.F.score).toBe(9);
    expect(output.scores.scales.G.score).toBe(7);
    expect(output.scores.scales.H.score).toBe(10);

    expect(output.scores.dimensions.TO).toEqual({
      label: 'Task orientation',
      score: 31,
      level: 0.6,
      high: false,
    });
    expect(output.scores.dimensions.RO).toEqual({
      label: 'Relationship orientation',
      score: 34,
      level: 2.4,
      high: true,
    });
    expect(output.scores.dimensions.E).toEqual({
      label: 'Effectiveness',
      score: 36,
      level: 3.6,
      high: true,
    });
    expect(output.scores.dimensions.O).toEqual({
      label: 'Other',
      score: 8,
      level: 0,
      high: false,
    });

    expect(output.patternCode).toBe('DV');
    expect(output.scores.profile).toEqual({
      code: 'DV',
      label: 'Developer',
    });
  });

  it('resolves every level pattern to its own profile', () => {
    const patterns: [boolean, boolean, boolean, string][] = [
      [true, true, true, 'E'],
      [true, true, false, 'CO'],
      [true, false, true, 'BA'],
      [true, false, false, 'AU'],
      [false, true, true, 'DV'],
      [false, true, false, 'MI'],
      [false, false, true, 'BU'],
      [false, false, false, 'DS'],
    ];

    for (const [to, ro, ef, code] of patterns) {
      // Each item scores one dimension on statement 0; statement 1 scores a
      // scale no dimension reads, so the pick alone decides above/below.
      const scaleItems = [
        item('t', ['T', 'X']),
        item('r', ['R', 'X']),
        item('e', ['E', 'X']),
      ];
      const responses = [
        { itemId: 't', value: { chosen: to ? 0 : 1 } },
        { itemId: 'r', value: { chosen: ro ? 0 : 1 } },
        { itemId: 'e', value: { chosen: ef ? 0 : 1 } },
      ];
      const output = scoreStyleGrid({
        items: scaleItems,
        responses,
        scoringConfig: SIMPLE,
      });
      expect({ asked: code, got: output.patternCode }).toEqual({
        asked: code,
        got: code,
      });
    }
  });

  it('returns an empty result when the config does not parse', () => {
    const output = scoreStyleGrid({
      items,
      responses: [],
      scoringConfig: { scales: [] },
    });
    expect(output.patternCode).toBe('');
    expect(output.scores.scales).toEqual({});
    expect(output.scores.profile).toBeNull();
  });

  it('ignores a pick that lands on a scale the config does not know', () => {
    const output = scoreStyleGrid({
      items: [item('i1', ['Z', 'A'])],
      responses: [{ itemId: 'i1', value: { chosen: 0 } }],
      scoringConfig: CONFIG,
    });
    expect(output.scores.scales.A.score).toBe(1);
    expect(output.scores.answered).toBe(0);
  });
});

/**
 * Answers for a full 8x8 grid whose row `i` holds `rows[i]` A-picks and whose
 * column `j` holds `columns[j]` B-picks.
 */
function grid(rows: number[], columns: number[]) {
  const need = columns.map((count) => 8 - count);
  const cells: number[][] = rows.map(() => new Array<number>(8).fill(1));

  // Fill the rows that need the most A-picks first, always taking the columns
  // that still owe the most A-picks — a greedy fit for this degree sequence.
  const order = rows
    .map((count, row) => ({ count, row }))
    .sort((a, b) => b.count - a.count);
  for (const { count, row } of order) {
    const targets = need
      .map((left, column) => ({ left, column }))
      .sort((a, b) => b.left - a.left)
      .slice(0, count);
    for (const { column } of targets) {
      cells[row][column] = 0;
      need[column] -= 1;
    }
  }
  expect(need).toEqual(Array(8).fill(0));

  const scaleOf = (index: number) => 'ABCDEFGH'[index];
  const items: { id: string; content: unknown }[] = [];
  const responses: { itemId: string; value: unknown }[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const id = `r${row}c${column}`;
      items.push({
        id,
        content: {
          statements: [`${id} kiri`, `${id} kanan`],
          mapping: [scaleOf(row), scaleOf(column)],
        },
      });
      responses.push({ itemId: id, value: { chosen: cells[row][column] } });
    }
  }
  return { items, responses };
}
