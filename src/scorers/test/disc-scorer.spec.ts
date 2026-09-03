import { scoreDisc } from '../disc-scorer';
import { SCORERS } from '../registry';
import { DISC_PATTERN_CATALOG } from '../schemas/forced-choice-disc';
import fixtures from '../../../tests/fixtures/disc-golden.json';

describe('ForcedChoiceDiscScorer (Task 5.1)', () => {
  for (const fixture of fixtures) {
    it(`golden: ${fixture.name}`, () => {
      const result = scoreDisc({
        items: fixture.items as unknown as Parameters<
          typeof scoreDisc
        >[0]['items'],
        responses: fixture.responses,
      });
      expect(result.patternCode).toBe(fixture.expected.patternCode);
      expect(result.scores).toEqual(fixture.expected.scores);
      expect(DISC_PATTERN_CATALOG).toContain(result.patternCode);
    });
  }

  it('sanitize strips mapping', () => {
    const scorer = SCORERS.FORCED_CHOICE_DISC;
    expect(
      scorer.sanitize({
        words: ['A', 'B', 'C', 'D'],
        mostMapping: ['D', 'I', 'S', 'C'],
        leastMapping: ['D', 'I', 'S', 'C'],
      }),
    ).toEqual({ words: ['A', 'B', 'C', 'D'] });
    expect(scorer.sanitize({ words: ['A'], mapping: ['D'] })).toEqual({});
  });

  it('pattern catalog is 40', () => {
    expect(DISC_PATTERN_CATALOG.length).toBe(40);
    expect(DISC_PATTERN_CATALOG[0]).toBe('1');
    expect(DISC_PATTERN_CATALOG[39]).toBe('40');
  });
});
