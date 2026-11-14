import {
  DEFAULT_RATING_RANGE,
  parseLikertConfig,
  parseLikertItem,
} from './schemas/likert';

/**
 * What the participant may see: the statement and the rating scale it is
 * answered on. `scale` and `reverse` are the key — they say which scale the
 * rating feeds and whether it is flipped — and must never leave the server.
 */
export function sanitizeLikertItem(
  content: unknown,
  scoringConfig?: unknown,
): Record<string, unknown> {
  const item = parseLikertItem(content);
  if (!item) return {};
  const range =
    parseLikertConfig(scoringConfig).ratingRange ?? DEFAULT_RATING_RANGE;
  return { text: item.text, min: range.min, max: range.max };
}
