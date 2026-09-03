import { maskParticipantName } from '../utils/mask-participant-name';

describe('maskParticipantName', () => {
  it('masks multi-word name to first name + last initial', () => {
    expect(maskParticipantName('Budi Santoso')).toBe('Budi S.');
  });

  it('keeps single-word name as-is', () => {
    expect(maskParticipantName('Budi')).toBe('Budi');
  });

  it('trims and collapses whitespace', () => {
    expect(maskParticipantName('  Budi   Santoso  ')).toBe('Budi S.');
  });

  it('uppercases the initial', () => {
    expect(maskParticipantName('budi santoso')).toBe('budi S.');
  });

  it('returns Unknown for empty name', () => {
    expect(maskParticipantName('   ')).toBe('Unknown');
  });
});
