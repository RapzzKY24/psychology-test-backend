import { parsePairItem } from './schemas/forced-choice-pair';

/**
 * What the participant may see: the stem and the two statements. `mapping` is
 * the key and must never leave the server.
 */
export function sanitizePairItem(content: unknown): Record<string, unknown> {
  const item = parsePairItem(content);
  if (!item) return {};
  return { question: item.question, statements: item.statements };
}
