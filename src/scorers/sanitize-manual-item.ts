import { parseManualItem } from './schemas/manual';

/** The participant sees the box and its printed mark — nothing else is stored. */
export function sanitizeManualItem(content: unknown): Record<string, unknown> {
  const item = parseManualItem(content);
  if (!item) return {};
  return { box: item.box, mark: item.mark };
}
