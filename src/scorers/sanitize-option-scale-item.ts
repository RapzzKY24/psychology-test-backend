import { parseOptionScaleItem } from './schemas/option-scale';

/**
 * What the participant may see: the statement and its three printed options.
 * `scale` and `reverse` are the key — they say which factor the pick feeds and
 * whether the option order runs low-to-high — and must never leave the server.
 */
export function sanitizeOptionScaleItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseOptionScaleItem(content);
  if (!item) return {};
  return { text: item.text, options: item.options };
}
