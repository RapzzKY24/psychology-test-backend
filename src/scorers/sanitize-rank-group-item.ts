import { parseRankGroupItem } from './schemas/rank-group';

/**
 * What the participant may see: the group's occupations. `mapping` is the key —
 * it says which interest field each position scores — and must never leave the
 * server.
 *
 * RMIB prints two occupation lists per group and tells the respondent to use
 * the one matching their sex, so the list follows the attempt's gender. The
 * mapping is positional, which is why the two lists must be the same length.
 * A missing `femaleOptions` (or an attempt without a gender) falls back to the
 * first list.
 */
export function sanitizeRankGroupItem(
  content: unknown,
  _scoringConfig?: unknown,
  context?: { gender?: string | null },
): Record<string, unknown> {
  const item = parseRankGroupItem(content);
  if (!item) return {};
  const options =
    context?.gender === 'FEMALE' && item.femaleOptions
      ? item.femaleOptions
      : item.options;
  return { question: item.question, options };
}
