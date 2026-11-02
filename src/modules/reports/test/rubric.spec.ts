import {
  NARRATIVE_FIELDS,
  NARRATIVE_KEYS,
  NARRATIVE_MAX_LENGTH,
  RATING_KEYS,
  RATING_SECTIONS,
  RATING_VALUES,
  RECOMMENDATION_VALUES,
} from '../rubric';
import {
  RatingCategory,
  Recommendation,
} from '../../../generated/prisma/enums';

describe('report rubric', () => {
  it('has 13 rated aspects across 4 sections', () => {
    expect(RATING_SECTIONS).toHaveLength(4);
    expect(RATING_KEYS).toHaveLength(13);
    const fromSections = RATING_SECTIONS.flatMap((s) => s.aspects);
    expect(fromSections).toHaveLength(13);
  });

  it('splits aspects 4 / 3 / 4 / 2 like the template', () => {
    expect(RATING_SECTIONS.map((s) => s.aspects.length)).toEqual([4, 3, 4, 2]);
  });

  it('has 6 narrative blocks', () => {
    expect(NARRATIVE_FIELDS).toHaveLength(6);
    expect(NARRATIVE_KEYS).toHaveLength(6);
  });

  it('uses unique keys within and across the two groups', () => {
    expect(new Set(RATING_KEYS).size).toBe(13);
    expect(new Set(NARRATIVE_KEYS).size).toBe(6);
    const overlap = RATING_KEYS.filter((k) => NARRATIVE_KEYS.includes(k));
    expect(overlap).toEqual([]);
  });

  it('gives every aspect and narrative a non-empty label', () => {
    const labels = [
      ...RATING_SECTIONS.flatMap((s) => [
        s.label,
        ...s.aspects.map((a) => a.label),
      ]),
      ...NARRATIVE_FIELDS.map((f) => f.label),
    ];
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
  });

  it('keeps rating values in sync with the Prisma enum', () => {
    expect([...RATING_VALUES].sort()).toEqual(
      Object.values(RatingCategory).sort(),
    );
  });

  it('keeps recommendation values in sync with the Prisma enum', () => {
    expect([...RECOMMENDATION_VALUES].sort()).toEqual(
      Object.values(Recommendation).sort(),
    );
  });

  it('caps a narrative at 800 characters', () => {
    expect(NARRATIVE_MAX_LENGTH).toBe(800);
  });
});
