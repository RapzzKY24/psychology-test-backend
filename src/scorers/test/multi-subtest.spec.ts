import {
  ageBandFor,
  convertGe,
  iqFor,
  parseMultiSubtestConfig,
  parseMultiSubtestItem,
  standardScoreRow,
  subtestOffsetMin,
  subtestOfItem,
  totalMinutes,
  type MultiSubtestConfig,
} from '../schemas/multi-subtest';
import {
  iqCategory,
  normalizeAnswer,
  scoreGeAnswer,
  scoreMultiSubtest,
  standardScoreCategory,
} from '../multi-subtest';
import { sanitizeMultiSubtestItem } from '../sanitize-multi-subtest-item';

/** Two subtests and two age bands: enough to exercise every branch. */
const CONFIG: MultiSubtestConfig = {
  subtests: [
    {
      code: 'SE',
      name: 'Melengkapi kalimat',
      kind: 'CHOICE',
      itemCount: 2,
      timeLimitMin: 6,
      instruction: 'Pilih kata yang melengkapi kalimat.',
    },
    {
      code: 'ME',
      name: 'Mengingat kata',
      kind: 'CHOICE',
      itemCount: 2,
      timeLimitMin: 3,
      memorizeMin: 3,
      instruction: 'Hafalkan daftar kata.',
    },
  ],
  ageBands: [
    { label: '13', maxMonths: 167 },
    { label: '>45', maxMonths: 2400 },
  ],
  standardScores: {
    '13': { SE: [70, 80, 90], ME: [60, 70, 80] },
    '>45': { SE: [75, 85, 95], ME: [65, 75, 85] },
  },
  iqTable: {
    '13': [0, 90, 95, 100, 105],
    '>45': [0, 95, 100, 105, 110],
  },
  geConversion: [1, 1, 2, 3],
  geRubric: {},
  dominanceBalancedWithin: 10,
};

function items() {
  return [
    {
      id: 'i1',
      order: 1,
      content: {
        kind: 'CHOICE',
        prompt: 'Pengaruh seseorang bergantung pada …',
        options: {
          a: 'kekuasaan',
          b: 'bujukan',
          c: 'kekayaan',
          d: 'keberanian',
          e: 'kewibawaan',
        },
        key: 'e',
      },
    },
    {
      id: 'i2',
      order: 2,
      content: {
        kind: 'CHOICE',
        prompt: 'Lawannya hemat ialah …',
        options: {
          a: 'murah',
          b: 'kikir',
          c: 'boros',
          d: 'bernilai',
          e: 'kaya',
        },
        key: 'c',
      },
    },
    {
      id: 'i3',
      order: 3,
      content: {
        kind: 'CHOICE',
        prompt: 'Huruf A adalah …',
        options: {
          a: 'bunga',
          b: 'perkakas',
          c: 'burung',
          d: 'kesenian',
          e: 'binatang',
        },
        key: 'd',
      },
    },
    {
      id: 'i4',
      order: 4,
      content: {
        kind: 'CHOICE',
        prompt: 'Huruf B adalah …',
        options: {
          a: 'bunga',
          b: 'perkakas',
          c: 'burung',
          d: 'kesenian',
          e: 'binatang',
        },
        key: 'b',
      },
    },
  ];
}

describe('MULTI_SUBTEST item schema', () => {
  it('accepts the four printed shapes', () => {
    expect(
      parseMultiSubtestItem({ kind: 'PAIR', words: ['mawar', 'melati'] }),
    ).not.toBeNull();
    expect(
      parseMultiSubtestItem({
        kind: 'NUMBER',
        series: [6, 9, 12, 15],
        key: 27,
      }),
    ).not.toBeNull();
    expect(
      parseMultiSubtestItem({
        kind: 'IMAGE',
        imageUrl: '/uploads/test-items/abc-1.png',
        key: 'a',
      }),
    ).not.toBeNull();
  });

  it('rejects a figure that is not a seeded item image', () => {
    expect(
      parseMultiSubtestItem({
        kind: 'IMAGE',
        imageUrl: 'https://example.com/x.png',
        key: 'a',
      }),
    ).toBeNull();
  });

  it('rejects a key outside the five letters', () => {
    expect(
      parseMultiSubtestItem({
        kind: 'CHOICE',
        prompt: 'x',
        options: { a: '1', b: '2', c: '3', d: '4', e: '5' },
        key: 'f',
      }),
    ).toBeNull();
  });
});

describe('sanitizeMultiSubtestItem', () => {
  it('never sends the key to the participant', () => {
    const out = sanitizeMultiSubtestItem({
      kind: 'CHOICE',
      prompt: 'Pengaruh …',
      options: { a: 'x', b: 'y', c: 'z', d: 'w', e: 'v' },
      key: 'e',
    });
    expect(out).not.toHaveProperty('key');
    expect(out.options).toBeDefined();
  });

  it('strips the key from a figure and keeps the image', () => {
    const out = sanitizeMultiSubtestItem({
      kind: 'IMAGE',
      imageUrl: '/uploads/test-items/abc-1.png',
      key: 'c',
    });
    expect(out).toEqual({
      kind: 'IMAGE',
      imageUrl: '/uploads/test-items/abc-1.png',
    });
  });

  it('keeps a series but not its answer', () => {
    const out = sanitizeMultiSubtestItem({
      kind: 'NUMBER',
      series: [6, 9, 12],
      key: 15,
    });
    expect(out).toEqual({ kind: 'NUMBER', series: [6, 9, 12] });
  });
});

describe('age bands', () => {
  it('reads the band whose ceiling covers the age', () => {
    expect(ageBandFor(CONFIG, 167)).toBe('13');
    expect(ageBandFor(CONFIG, 168)).toBe('>45');
    expect(ageBandFor(CONFIG, 700)).toBe('>45');
  });

  it('clamps past the ends of a table', () => {
    expect(standardScoreRow(CONFIG, '13', 'SE', 99)).toBe(90);
    expect(iqFor(CONFIG, '13', 99)).toBe(105);
  });

  it('converts the GE rubric onto the 1–20 scale', () => {
    expect(convertGe(CONFIG, 0)).toBe(1);
    expect(convertGe(CONFIG, 2)).toBe(2);
    expect(convertGe(CONFIG, 99)).toBe(3);
  });
});

describe('subtest layout', () => {
  it('maps an item order to its subtest', () => {
    expect(subtestOfItem(CONFIG, 1)?.code).toBe('SE');
    expect(subtestOfItem(CONFIG, 2)?.code).toBe('SE');
    expect(subtestOfItem(CONFIG, 3)?.code).toBe('ME');
    expect(subtestOfItem(CONFIG, 5)).toBeNull();
  });

  it('counts the memorisation time into the next window', () => {
    expect(subtestOffsetMin(CONFIG, 'SE')).toBe(0);
    // SE runs 6 minutes, so ME opens after them; its own memorise phase is
    // added by the caller, which is why the offset stops at 6.
    expect(subtestOffsetMin(CONFIG, 'ME')).toBe(6);
    expect(totalMinutes(CONFIG)).toBe(12);
  });
});

describe('GE rubric', () => {
  const config: MultiSubtestConfig = {
    ...CONFIG,
    geRubric: {
      '61': {
        score2: ['Bunga', 'Kembang', 'Perdu'],
        score1: ['Tumbuh-tumbuhan', 'Harum'],
      },
    },
  };

  it('gives 2 for a concept word and 1 for the wider class', () => {
    expect(scoreGeAnswer(config, 61, 'bunga')).toBe(2);
    expect(scoreGeAnswer(config, 61, 'Bunga mawar')).toBe(2);
    expect(scoreGeAnswer(config, 61, 'tumbuh-tumbuhan')).toBe(1);
  });

  it('gives nothing for an answer outside the rubric', () => {
    expect(scoreGeAnswer(config, 61, 'pohon')).toBe(0);
    expect(scoreGeAnswer(config, 61, '')).toBe(0);
    expect(scoreGeAnswer(config, 99, 'bunga')).toBe(0);
  });

  it('normalises case and punctuation', () => {
    expect(normalizeAnswer('  Tumbuh-Tumbuhan!  ')).toBe('tumbuh tumbuhan');
    expect(scoreGeAnswer(config, 61, 'TUMBUH-TUMBUHAN')).toBe(1);
  });
});

describe('scoreMultiSubtest', () => {
  it('scores every subtest and reads the band total', () => {
    const out = scoreMultiSubtest({
      items: items(),
      responses: [
        { itemId: 'i1', value: { answer: 'e' } },
        { itemId: 'i2', value: { answer: 'a' } },
        { itemId: 'i3', value: { answer: 'd' } },
        { itemId: 'i4', value: { answer: 'b' } },
      ],
      scoringConfig: CONFIG,
      ageMonths: 160,
    });

    expect(out.patternCode).toBe('IST');
    expect(out.scores.ageBand).toBe('13');
    expect(out.scores.sections.map((s) => [s.code, s.raw])).toEqual([
      ['SE', 1],
      ['ME', 2],
    ]);
    // The fixture's table has five rows (total 0–4), so a total of 3 reads
    // index 3.
    expect(out.scores.totalRaw).toBe(3);
    expect(out.scores.iq).toBe(100);
    expect(out.scores.iqCategory).toBe('Average');
  });

  it('counts an unanswered item as wrong without refusing the attempt', () => {
    const out = scoreMultiSubtest({
      items: items(),
      responses: [],
      scoringConfig: CONFIG,
      ageMonths: 160,
    });
    expect(out.scores.sections.every((s) => s.answered === 0)).toBe(true);
    expect(out.scores.totalRaw).toBe(0);
    expect(out.scores.iq).toBe(0);
  });

  it('leaves the norm rows empty when the attempt recorded no age', () => {
    const out = scoreMultiSubtest({
      items: items(),
      responses: [{ itemId: 'i1', value: { answer: 'e' } }],
      scoringConfig: CONFIG,
      ageMonths: null,
    });
    expect(out.scores.ageBand).toBeNull();
    expect(out.scores.iq).toBeNull();
    expect(out.scores.dominance).toBeNull();
    expect(out.scores.sections[0]?.standardScore).toBeNull();
  });

  it('compares numbers by value, not by spelling', () => {
    const out = scoreMultiSubtest({
      items: [
        {
          id: 'n1',
          order: 1,
          content: { kind: 'NUMBER', prompt: 'Berapa?', key: 1050 },
        },
      ],
      responses: [{ itemId: 'n1', value: { answer: '1.050' } }],
      scoringConfig: {
        ...CONFIG,
        subtests: [{ ...CONFIG.subtests[0], itemCount: 1 }],
      },
      ageMonths: 160,
    });
    expect(out.scores.sections[0]?.correct).toBe(1);
  });

  it('refuses to score without a config', () => {
    expect(() =>
      scoreMultiSubtest({ items: [], responses: [], scoringConfig: null }),
    ).toThrow(/scoringConfig/);
  });
});

describe('categories', () => {
  it('labels a standard score the way the workbook does', () => {
    expect(standardScoreCategory(80)).toBe('Sangat Rendah');
    expect(standardScoreCategory(94)).toBe('Rendah');
    expect(standardScoreCategory(99)).toBe('Sedang');
    expect(standardScoreCategory(104)).toBe('Cukup');
    expect(standardScoreCategory(118)).toBe('Tinggi');
    expect(standardScoreCategory(119)).toBe('Sangat Tinggi');
  });

  it('labels an IQ the way the workbook does', () => {
    expect(iqCategory(65)).toBe('Mentally Defective');
    expect(iqCategory(90)).toBe('Low Average');
    expect(iqCategory(110)).toBe('Average');
    expect(iqCategory(140)).toBe('Genius');
  });
});

describe('config parsing', () => {
  it('accepts the fixture and rejects a config without subtests', () => {
    expect(parseMultiSubtestConfig(CONFIG)).not.toBeNull();
    expect(parseMultiSubtestConfig({ ...CONFIG, subtests: [] })).toBeNull();
  });
});
