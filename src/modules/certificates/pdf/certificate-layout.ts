/**
 * Geometry of the client certificate template, in pt from the top-left corner.
 *
 * Every number here was read from the blank template PDF, not estimated:
 * `pdftohtml -xml` gives the text-box origin and the font of each baked label,
 * `pdftotext -bbox` gives the ink box, and the photo bracket was measured on a
 * 150 dpi raster. The template is A4 at 595.5 x 842.25 pt.
 *
 * The values below are the *gaps* the template leaves between its baked
 * labels, so they sit next to text the renderer must not move. Changing a
 * label means regenerating template.svg, not editing this file.
 *
 * Sizes are the ones the PDF declares for the neighbouring label. They are
 * confirmed against a render in the render phase; if a value looks a hair too
 * large next to its label, fix it here rather than compensating in CSS.
 */

export const PAGE = { width: 595.5, height: 842.25 } as const;

/** The only text colour the template uses, sampled from its glyph fills. */
export const INK = '#123b73';

/**
 * Raleway ships as one variable file (weight axis 100-900), so a slot names a
 * weight instead of a separate font file.
 */
export type FontWeight = 400 | 600 | 800;

export interface TextSlot {
  /** Left edge of the text box. */
  readonly x: number;
  /** Top edge of the text box, not the baseline. */
  readonly top: number;
  readonly size: number;
  readonly weight: FontWeight;
  /** Wraps beyond this width; keep it inside the template's margin. */
  readonly maxWidth: number;
  readonly align: 'left' | 'center';
}

export const TEXT = {
  /** Continues `HASIL TES PSIKOLOGI - ` on the subtitle line. */
  testName: {
    x: 352.5,
    top: 176,
    size: 28,
    weight: 800,
    maxWidth: 150,
    align: 'left',
  },
  /** Continues `No Sertifikat : `. */
  number: {
    x: 286,
    top: 210.7,
    size: 15,
    weight: 400,
    maxWidth: 110,
    align: 'left',
  },
  /** Continues `Sertifikat ini berlaku sampai dengan `. */
  validUntil: {
    x: 352.7,
    top: 545.3,
    size: 18,
    weight: 400,
    maxWidth: 150,
    align: 'left',
  },
  /** The whole `<verdict> untuk <purpose>.` sentence. */
  verdict: {
    x: 122.7,
    top: 513,
    size: 18,
    weight: 400,
    maxWidth: 380.7,
    align: 'left',
  },
  /** `<KOTA>, <tanggal>` above the sign-off block. */
  cityDate: {
    x: 334,
    top: 587.5,
    size: 18,
    weight: 400,
    maxWidth: 185,
    align: 'left',
  },
  /** Centred on the baked `Psikolog` label at x 417.6. */
  psychologistName: {
    x: 348.4,
    top: 702,
    size: 18,
    weight: 600,
    maxWidth: 160,
    align: 'center',
  },
  /** Continues the baked `SIPP NO ` prefix. */
  sippNumber: {
    x: 411.5,
    top: 721.8,
    size: 18,
    weight: 600,
    maxWidth: 96,
    align: 'left',
  },
} as const satisfies Record<string, TextSlot>;

/**
 * The six identity rows. The labels and the colons are baked into the
 * template; only the values are drawn, in the column to the right of the
 * colons (x 335.5-338.7).
 */
export const IDENTITY = {
  /** Left edge of the value column, measured from the placeholder run. */
  valueX: 346.6,
  /** Width available before the template's right margin. */
  valueWidth: 157,
  size: 18,
  weight: 600,
  /** Row tops, in the order the template prints them. */
  rows: [
    { key: 'fullName', top: 310 },
    { key: 'idNumber', top: 324 },
    { key: 'gender', top: 338.7 },
    { key: 'birthPlaceDate', top: 352.7 },
    { key: 'age', top: 367.3 },
    { key: 'address', top: 382 },
  ],
} as const;

export type IdentityKey = (typeof IDENTITY.rows)[number]['key'];

export interface ImageSlot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const IMAGE = {
  /**
   * The bracket is drawn on three sides only — the bottom edge is open, so the
   * photo is clipped to this box rather than fitted inside a frame.
   */
  photo: { x: 68.5, y: 302.2, width: 101.8, height: 115.3 },
  /**
   * The band between `Psikolog` (ends 623.3) and the psychologist's name
   * (starts 702.0). Only 78.7 pt tall, so the signature is scaled to fit and
   * never placed at its natural size.
   */
  signature: { x: 345, y: 623.3, width: 145, height: 78.7 },
  /** Between the validity line and the `VALIDASI SERTIFIKAT` caption. */
  qr: { x: 102, y: 606.4, width: 58.1, height: 58.1 },
} as const satisfies Record<string, ImageSlot>;

/** Centre of the sign-off column, i.e. the centre of the baked `Psikolog`. */
export const SIGNOFF_CENTRE_X = 417.6;
