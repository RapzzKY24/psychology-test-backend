import { parseMarkGroupItem } from './schemas/mark-group';

/**
 * What the participant may see: the activities. `mapping` says which fields an
 * activity scores and `verification` says which ones the validity scale counts
 * — both are the key and must never leave the server.
 */
export function sanitizeMarkGroupItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseMarkGroupItem(content);
  if (!item) return {};
  return { question: item.question, options: item.options };
}
