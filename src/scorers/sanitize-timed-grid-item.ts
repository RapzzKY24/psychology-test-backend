import { parseTimedGridItem } from './schemas/timed-grid';

/**
 * What the participant may see: the lajur number and its digits. The key is
 * derived from the digits on the server and never stored, so there is nothing
 * else to strip.
 */
export function sanitizeTimedGridItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseTimedGridItem(content);
  if (!item) return {};
  return { column: item.column, digits: item.digits };
}
