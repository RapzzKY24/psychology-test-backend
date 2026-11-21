import { sanitizeNumberSegment } from '../../reports/utils/sanitize-number-segment';

/**
 * The test segment of a certificate number, as short as the instrument allows.
 *
 * `CPMI` stays `CPMI`; `WPT (Wonderlic Personnel Test)` becomes `WPT`; a short
 * token in parentheses is the instrument's own abbreviation (`Wartegg (WZT)`
 * -> `WZT`). A name with no short form keeps its words, so `Big Five
 * Inventory` becomes `BIG-FIVE-INVENTORY` rather than an invented acronym.
 */
export function testNumberLabel(name: string): string {
  const trimmed = name.trim().replace(/^tes\s+/i, '');

  // A short uppercase token in parentheses is the instrument's own
  // abbreviation. Lowercase parentheses are explanations, e.g. "CPMI (arsip)".
  const short = trimmed.match(/\(([A-Z0-9]{2,8})\)/);
  if (short) return sanitizeNumberSegment(short[1]);

  const paren = trimmed.indexOf('(');
  if (paren > 0) return sanitizeNumberSegment(trimmed.slice(0, paren));

  // `MSAI — Managerial Skills ...` puts the acronym before a spaced dash.
  const [head, ...rest] = trimmed.split(/\s+[—–-]\s+/);
  if (rest.length > 0 && /^[a-z0-9]{2,8}$/i.test(head.trim())) {
    return sanitizeNumberSegment(head);
  }

  return sanitizeNumberSegment(trimmed);
}
