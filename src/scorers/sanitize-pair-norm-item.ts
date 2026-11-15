import { parsePairNormItem } from './schemas/pair-norm';

/**
 * What the participant sees: the two statements, nothing else. `mapping` is the
 * answer key and must never leave the server — the same rule every pair family
 * follows.
 */
export function sanitizePairNormItem(
  content: unknown,
): Record<string, unknown> {
  const parsed = parsePairNormItem(content);
  if (!parsed) return {};
  return {
    ...(parsed.question ? { question: parsed.question } : {}),
    statements: parsed.statements,
  };
}
