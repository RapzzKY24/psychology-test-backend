import { z } from 'zod';

/**
 * The eight starter marks printed on the Wartegg form, in box order. The
 * spelling is the sheet's own layout: box 3 carries three rising bars, box 6
 * two separate lines rather than a crossing, box 7 a dotted arc.
 */
export const MANUAL_MARKS = [
  /** 1 — a single dot, upper middle. */
  'DOT',
  /** 2 — a short wavy stroke, upper middle. */
  'CURVE',
  /** 3 — three upright bars of rising height, lower right. */
  'BARS',
  /** 4 — a small filled square, upper right. */
  'SQUARE',
  /** 5 — two short diagonals meeting at an angle, lower left. */
  'DIAGONALS',
  /** 6 — a horizontal line above a separate vertical one. */
  'AXES',
  /** 7 — an arc drawn as dots, lower middle. */
  'DOTTED_ARC',
  /** 8 — a wide arc, upper middle. */
  'ARC',
] as const;

export type ManualMark = (typeof MANUAL_MARKS)[number];

/** One box of the form. The mark is what the sheet prints; the participant draws over it. */
export const ManualItemContentSchema = z.object({
  box: z.number().int().min(1).max(8),
  mark: z.enum(MANUAL_MARKS),
});

export type ManualItemContent = z.infer<typeof ManualItemContentSchema>;

export function parseManualItem(content: unknown): ManualItemContent | null {
  const parsed = ManualItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/**
 * Where one drawing is served from. Derived from the two ids, never from the
 * upload: a filename the client sent would be a path to sanitise, and a path
 * the client chose would let one attempt point at another's drawing.
 */
export function manualImagePath(attemptId: string, itemId: string): string {
  return `/api/v1/public/attempts/${attemptId}/items/${itemId}/image`;
}

const UUID =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * The answer is the drawing's location, not the drawing. The file itself is
 * written by the upload endpoint and read back by id, so a value that names a
 * different attempt's item changes nothing — the route resolves the path.
 */
export const ManualResponseSchema = z.object({
  imageUrl: z
    .string()
    .regex(
      new RegExp(`^/api/v1/public/attempts/${UUID}/items/${UUID}/image$`),
      'imageUrl must point at this attempt item',
    ),
});

export type ManualResponse = z.infer<typeof ManualResponseSchema>;

/**
 * No pattern codes: a projective drawing has no typology, and the psychologist
 * writes the whole reading in the review notes. Publish must not demand an
 * interpretation row for a code that carries no text.
 */
export function manualPatternCodes(): string[] {
  return [];
}
