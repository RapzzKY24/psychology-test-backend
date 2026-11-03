import { createFields, describeSync, isForce, updateFields } from './seed-test';
import type { SeedTestMeta } from './seed-test';

const meta: SeedTestMeta = {
  slug: 'wpt',
  name: 'WPT',
  description: 'Tes kemampuan memecahkan masalah.',
  category: 'COGNITIVE',
  scorerType: 'RIGHT_WRONG_NORM',
  price: 20000,
  estimatedDurationMin: 12,
  timeLimitMin: 12,
  normTable: [{ raw: 0, iq: 59 }],
};

describe('updateFields', () => {
  it('leaves price and status alone on a routine run', () => {
    const fields = updateFields(meta, false);

    expect(fields).not.toHaveProperty('price');
    expect(fields).not.toHaveProperty('status');
    expect(fields.name).toBe('WPT');
    expect(fields.timeLimitMin).toBe(12);
  });

  it('overwrites price and status with --force', () => {
    const fields = updateFields(meta, true);

    expect(fields.price).toBe(20000);
    expect(fields.status).toBe('PUBLISHED');
  });
});

describe('createFields', () => {
  it('always sets slug, price and status for a brand new test', () => {
    const fields = createFields(meta);

    expect(fields.slug).toBe('wpt');
    expect(fields.price).toBe(20000);
    expect(fields.status).toBe('PUBLISHED');
  });
});

describe('isForce', () => {
  it('reads the flag from argv', () => {
    expect(isForce(['node', 'seed-wpt.ts', '--force'])).toBe(true);
    expect(isForce(['node', 'seed-wpt.ts'])).toBe(false);
  });
});

describe('describeSync', () => {
  it('summarises the three counters', () => {
    expect(describeSync({ created: 1, updated: 2, deleted: 0 })).toBe(
      '1 created, 2 updated, 0 removed',
    );
  });
});
