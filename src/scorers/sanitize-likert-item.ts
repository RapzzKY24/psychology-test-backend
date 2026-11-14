import {
  DEFAULT_RATING_RANGE,
  parseLikertConfig,
  parseLikertItem,
} from './schemas/likert';

/**
 * What the participant may see: the statement and the rating scale it is
 * answered on. `scale`, `section` and `reverse` are the key — they say which
 * scale the rating feeds, which part of the inventory the item belongs to and
 * whether it is flipped — and must never leave the server.
 */
export function sanitizeLikertItem(
  content: unknown,
  scoringConfig?: unknown,
): Record<string, unknown> {
  const item = parseLikertItem(content);
  if (!item) return {};
  const config = parseLikertConfig(scoringConfig);
  const range = config.ratingRange ?? DEFAULT_RATING_RANGE;
  const sanitized: Record<string, unknown> = {
    text: item.text,
    min: range.min,
    max: range.max,
  };
  // The label of each point is the instrument's, not the family's: without it
  // a 0–3 scale reads as four anonymous numbers. A multi-section inventory
  // words the same points differently per section (MSAI).
  const labels =
    (item.section && config.sectionLabels?.[item.section]) ??
    config.ratingLabels;
  if (labels) sanitized.labels = labels;
  return sanitized;
}
