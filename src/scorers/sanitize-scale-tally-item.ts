import { parseScaleTallyItem } from './schemas/scale-tally';

/**
 * What the participant may see: the statement and the two labels. `scale` is
 * the key — it says which scale the answer scores — and must never leave the
 * server.
 */
export function sanitizeScaleTallyItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseScaleTallyItem(content);
  if (!item) return {};
  return { question: item.question, options: item.options };
}
