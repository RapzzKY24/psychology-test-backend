import { parseStyleGridItem } from './schemas/style-grid';

/**
 * What the participant may see: the optional stem and the two statements.
 * `mapping` is the key and must never leave the server.
 */
export function sanitizeStyleGridItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseStyleGridItem(content);
  if (!item) return {};
  return {
    ...(item.question ? { question: item.question } : {}),
    statements: item.statements,
  };
}
