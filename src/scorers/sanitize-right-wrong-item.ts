import { parseRightWrongItem } from './schemas/right-wrong-norm';

/**
 * What the participant may see: never the key (`correctIndexes`, `accepted`).
 * `multi` is safe to expose — the question text already says how many parts
 * are wanted — and the runner needs it to pick radios over checkboxes.
 */
export function sanitizeRightWrongItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseRightWrongItem(content);
  if (!item) return {};

  const out: Record<string, unknown> = { answerMode: item.answerMode };
  if (item.question) out.question = item.question;
  if (item.imageUrl) out.imageUrl = item.imageUrl;
  if (item.subtest) out.subtest = item.subtest;

  if (item.answerMode === 'choice') {
    out.options = item.options;
    out.multi = item.correctIndexes.length > 1;
  }
  return out;
}
