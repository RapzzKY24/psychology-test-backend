import {
  NARRATIVE_KEYS,
  NARRATIVE_MAX_LENGTH,
  RATING_KEYS,
  RATING_VALUES,
  RECOMMENDATION_VALUES,
} from '../rubric';

export interface ReportInput {
  readonly ratings?: Readonly<Record<string, unknown>> | null;
  readonly narratives?: Readonly<Record<string, unknown>> | null;
  readonly recommendation?: unknown;
}

export type ReportInputError =
  | { field: string; code: 'unknown_field' }
  | { field: string; code: 'invalid_rating'; value: string }
  | { field: string; code: 'invalid_recommendation'; value: string }
  | { field: string; code: 'too_long'; length: number; max: number };

const RATING_KEY_SET = new Set(RATING_KEYS);
const NARRATIVE_KEY_SET = new Set(NARRATIVE_KEYS);
const RATING_VALUE_SET: ReadonlySet<string> = new Set(RATING_VALUES);
const RECOMMENDATION_VALUE_SET: ReadonlySet<string> = new Set(
  RECOMMENDATION_VALUES,
);

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Shape validation for a save (PUT). Partial input is allowed — a psychologist
 * may fill three aspects and come back later — but nothing malformed is stored.
 */
export function validateReportInput(input: ReportInput): ReportInputError[] {
  const errors: ReportInputError[] = [];

  for (const [field, value] of Object.entries(input.ratings ?? {})) {
    if (!RATING_KEY_SET.has(field)) {
      errors.push({ field: `ratings.${field}`, code: 'unknown_field' });
      continue;
    }
    if (typeof value !== 'string' || !RATING_VALUE_SET.has(value)) {
      errors.push({
        field: `ratings.${field}`,
        code: 'invalid_rating',
        value: String(value),
      });
    }
  }

  for (const [field, value] of Object.entries(input.narratives ?? {})) {
    if (!NARRATIVE_KEY_SET.has(field)) {
      errors.push({ field: `narratives.${field}`, code: 'unknown_field' });
      continue;
    }
    if (typeof value !== 'string') {
      errors.push({
        field: `narratives.${field}`,
        code: 'too_long',
        length: Number.POSITIVE_INFINITY,
        max: NARRATIVE_MAX_LENGTH,
      });
      continue;
    }
    const length = value.trim().length;
    if (length > NARRATIVE_MAX_LENGTH) {
      errors.push({
        field: `narratives.${field}`,
        code: 'too_long',
        length,
        max: NARRATIVE_MAX_LENGTH,
      });
    }
  }

  const recommendation = input.recommendation;
  if (recommendation !== undefined && recommendation !== null) {
    if (
      typeof recommendation !== 'string' ||
      !RECOMMENDATION_VALUE_SET.has(recommendation)
    ) {
      errors.push({
        field: 'recommendation',
        code: 'invalid_recommendation',
        value:
          typeof recommendation === 'string'
            ? recommendation
            : JSON.stringify(recommendation),
      });
    }
  }

  return errors;
}

/**
 * Fields still required before a report may be issued: 13 ratings + 6
 * narratives + the recommendation. Returned in template order so the UI can
 * show them top-to-bottom.
 */
export function collectMissingFields(input: ReportInput): string[] {
  const missing: string[] = [];

  for (const key of RATING_KEYS) {
    if (isBlank(input.ratings?.[key])) missing.push(`ratings.${key}`);
  }
  for (const key of NARRATIVE_KEYS) {
    if (isBlank(input.narratives?.[key])) missing.push(`narratives.${key}`);
  }
  if (
    typeof input.recommendation !== 'string' ||
    !RECOMMENDATION_VALUE_SET.has(input.recommendation)
  ) {
    missing.push('recommendation');
  }

  return missing;
}
