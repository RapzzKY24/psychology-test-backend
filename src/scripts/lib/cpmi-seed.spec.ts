import { buildCpmiData } from './cpmi-seed';
import type { SeedData } from './seed-test';

const wpt: SeedData = {
  test: {
    slug: 'wpt',
    name: 'WPT (Wonderlic Personnel Test)',
    description: 'Tes kemampuan memecahkan masalah.',
    category: 'COGNITIVE',
    scorerType: 'RIGHT_WRONG_NORM',
    price: 20000,
    estimatedDurationMin: 12,
    timeLimitMin: 12,
    normTable: [{ raw: 0, iq: 59 }],
  },
  items: [{ order: 1, content: { question: 'Bulan lalu pada awal tahun ini adalah' } }],
  interpretations: [{ patternCode: 'RAW_0', title: 'Skor 0 dari 50', body: '...' }],
};

describe('buildCpmiData', () => {
  it('renames the test but keeps the instrument intact', () => {
    const data = buildCpmiData(wpt);

    expect(data.test.slug).toBe('cpmi');
    expect(data.test.name).toBe('CPMI');
    expect(data.test.price).toBe(20000);
    expect(data.test.timeLimitMin).toBe(12);
    expect(data.test.normTable).toEqual(wpt.test.normTable);
    expect(data.items).toEqual(wpt.items);
    expect(data.interpretations).toEqual(wpt.interpretations);
  });

  it('leaves the WPT source untouched', () => {
    buildCpmiData(wpt);

    expect(wpt.test.slug).toBe('wpt');
    expect(wpt.test.name).toBe('WPT (Wonderlic Personnel Test)');
  });
});
