const MAX_LENGTH = 20;
const FALLBACK = 'PSIKOTES';

/**
 * Turns a session title into one slash-free segment of the report number:
 * uppercase, separators collapsed to "-", at most 20 characters.
 * "Psikotes / Batch 1" → "PSIKOTES-BATCH-1"
 */
export function sanitizeNumberSegment(title: string): string {
  const cleaned = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');
  return cleaned.length > 0 ? cleaned : FALLBACK;
}
