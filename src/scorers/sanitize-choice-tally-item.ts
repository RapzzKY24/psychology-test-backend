import { parseChoiceTallyItem } from './schemas/choice-tally';

/**
 * What the participant may see: the question and the options. `mapping` is the
 * key — it says which scale each answer scores — and must never leave the
 * server.
 */
export function sanitizeChoiceTallyItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseChoiceTallyItem(content);
  if (!item) return {};
  return { question: item.question, options: item.options };
}
