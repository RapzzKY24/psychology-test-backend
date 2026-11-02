import {
  collectMissingFields,
  validateReportInput,
} from '../utils/validate-report';
import type { ReportInput } from '../utils/validate-report';
import { NARRATIVE_KEYS, NARRATIVE_MAX_LENGTH, RATING_KEYS } from '../rubric';

function completeInput(): ReportInput {
  return {
    ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, 'B'])),
    narratives: Object.fromEntries(
      NARRATIVE_KEYS.map((k) => [k, 'Cukup baik.']),
    ),
    recommendation: 'LAYAK',
  };
}

describe('validateReportInput', () => {
  it('accepts a complete report', () => {
    expect(validateReportInput(completeInput())).toEqual([]);
  });

  it('accepts a partial report (draft)', () => {
    expect(
      validateReportInput({ ratings: { 'intellectual.logic': 'T' } }),
    ).toEqual([]);
  });

  it('rejects an unknown rating key', () => {
    const errors = validateReportInput({
      ratings: { 'intellectual.unknown': 'B' },
    });
    expect(errors).toEqual([
      { field: 'ratings.intellectual.unknown', code: 'unknown_field' },
    ]);
  });

  it('rejects a rating outside R/K/C/B/T', () => {
    const errors = validateReportInput({
      ratings: { 'intellectual.logic': 'X' },
    });
    expect(errors).toEqual([
      {
        field: 'ratings.intellectual.logic',
        code: 'invalid_rating',
        value: 'X',
      },
    ]);
  });

  it('rejects a lowercase rating', () => {
    expect(
      validateReportInput({ ratings: { 'intellectual.logic': 'b' } }),
    ).toHaveLength(1);
  });

  it('accepts a narrative of exactly the maximum length', () => {
    const errors = validateReportInput({
      narratives: { overall: 'a'.repeat(NARRATIVE_MAX_LENGTH) },
    });
    expect(errors).toEqual([]);
  });

  it('rejects a narrative one character over the maximum', () => {
    const errors = validateReportInput({
      narratives: { overall: 'a'.repeat(NARRATIVE_MAX_LENGTH + 1) },
    });
    expect(errors).toEqual([
      {
        field: 'narratives.overall',
        code: 'too_long',
        length: NARRATIVE_MAX_LENGTH + 1,
        max: NARRATIVE_MAX_LENGTH,
      },
    ]);
  });

  it('measures the limit after trimming whitespace', () => {
    const errors = validateReportInput({
      narratives: { overall: `  ${'a'.repeat(NARRATIVE_MAX_LENGTH)}  ` },
    });
    expect(errors).toEqual([]);
  });

  it('rejects an unknown narrative key', () => {
    expect(validateReportInput({ narratives: { bogus: 'x' } })).toEqual([
      { field: 'narratives.bogus', code: 'unknown_field' },
    ]);
  });

  it('rejects a non-string narrative', () => {
    const errors = validateReportInput({
      narratives: { overall: 42 as unknown as string },
    });
    expect(errors[0].code).toBe('too_long');
  });

  it('rejects an invalid recommendation', () => {
    const errors = validateReportInput({ recommendation: 'MUNGKIN' });
    expect(errors).toEqual([
      {
        field: 'recommendation',
        code: 'invalid_recommendation',
        value: 'MUNGKIN',
      },
    ]);
  });

  it('allows an absent recommendation on a draft', () => {
    expect(validateReportInput({ recommendation: null })).toEqual([]);
  });
});

describe('collectMissingFields', () => {
  it('lists all 20 fields for an empty report', () => {
    const missing = collectMissingFields({});
    expect(missing).toHaveLength(20);
    expect(missing.filter((f) => f.startsWith('ratings.'))).toHaveLength(13);
    expect(missing.filter((f) => f.startsWith('narratives.'))).toHaveLength(6);
    expect(missing).toContain('recommendation');
  });

  it('returns nothing for a complete report', () => {
    expect(collectMissingFields(completeInput())).toEqual([]);
  });

  it('treats whitespace-only narratives as missing', () => {
    const input = completeInput();
    const narratives = { ...input.narratives, overall: '   ' };
    expect(collectMissingFields({ ...input, narratives })).toEqual([
      'narratives.overall',
    ]);
  });

  it('treats a blank rating as missing', () => {
    const input = completeInput();
    const ratings = { ...input.ratings, 'learning.change': '' };
    expect(collectMissingFields({ ...input, ratings })).toEqual([
      'ratings.learning.change',
    ]);
  });

  it('reports the recommendation when it is absent', () => {
    const input = completeInput();
    expect(collectMissingFields({ ...input, recommendation: null })).toEqual([
      'recommendation',
    ]);
  });

  it('keeps template order: ratings, narratives, recommendation', () => {
    const missing = collectMissingFields({});
    expect(missing[0]).toBe(`ratings.${RATING_KEYS[0]}`);
    expect(missing[12]).toBe(`ratings.${RATING_KEYS[12]}`);
    expect(missing[13]).toBe(`narratives.${NARRATIVE_KEYS[0]}`);
    expect(missing[19]).toBe('recommendation');
  });
});
