import type { ScorerOutput } from './registry';

/**
 * Wartegg is read, not scored. The eight drawings are the whole record, and the
 * psychologist's reading lives in the review notes — so the result carries no
 * numbers and one fixed code, and nothing downstream has to special-case a
 * family that produces nothing.
 */
export function scoreManual(): ScorerOutput {
  return { scores: {}, patternCode: 'MANUAL' };
}
