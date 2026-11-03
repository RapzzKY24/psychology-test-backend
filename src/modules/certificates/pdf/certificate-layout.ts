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
 * label means regenerating template.png, not editing this file.
 *
 * Sizes are the ones the PDF declares, not the ones it prints. The file was
 * laid out on a canvas larger than the page and every run carries a text
 * matrix that scales it down, so a label the PDF calls 18 pt prints at ~12.6 pt
 * (measured against a 200 dpi raster of the template). `DECLARED_TO_PRINTED`
 * is that factor, applied by the renderer; the numbers below stay as the PDF
 * declares them so they can still be checked against `pdftohtml -xml`.
 */

export const PAGE = { width: 595.5, height: 842.25 } as const;

/** The only text colour the template uses, sampled from its glyph fills. */
export const INK = '#123b73';

/**
 * Declared font size -> printed font size.
 *
 * Derived twice over, and both agree: by advance width (SERTIFIKAT declares
 * 46 pt, its ink is 174.9 pt wide, Raleway ExtraBold needs 259.6 pt at 46 pt)
 * and by cap height (the same run's caps are 22.3 pt tall against a 0.710 cap
 * ratio, i.e. 31.4 pt). Weight- and size-independent within 1 %.
 */
export const DECLARED_TO_PRINTED = 0.7;

/**
 * Raleway ships as one variable file (weight axis 100-900), so a slot names a
 * weight instead of a separate font file.
 */
export type FontWeight = 400 | 600 | 700 | 800;

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
  /**
   * Continues `No Sertifikat : `. The placeholder in the template is only
   * 105 pt wide, but a real number (`060/TES-KRAEPELIN/YM/XI/2026`) is twice
   * that, so the box runs to the page margin instead.
   */
  number: {
    x: 286,
    top: 210.7,
    size: 15,
    weight: 400,
    maxWidth: 215,
    align: 'left',
  },
  /**
   * Continues `Sertifikat ini berlaku sampai dengan `. The placeholder in the
   * template is Raleway-Bold, unlike the Regular sentence in front of it.
   */
  validUntil: {
    x: 352.7,
    top: 545.3,
    size: 18,
    weight: 700,
    maxWidth: 150,
    align: 'left',
  },
  /**
   * The whole `<verdict> untuk <purpose>.` sentence. The template mixes
   * weights inside this line — the verdict and the purpose are Bold, the word
   * "untuk" between them is Regular — so `weight` is the base and the renderer
   * marks the two bold runs up.
   */
  verdict: {
    x: 122.7,
    top: 513,
    size: 18,
    weight: 400,
    maxWidth: 380.7,
    align: 'left',
  },
  /**
   * `<KOTA>, <tanggal>` above the sign-off block. The template prints the city
   * SemiBold and the date Bold; one weight for the line reads better than a
   * seam in the middle of it, so both are SemiBold.
   */
  cityDate: {
    x: 334,
    top: 587.5,
    size: 18,
    weight: 600,
    maxWidth: 185,
    align: 'left',
  },
  /** Centred on the baked `Psikolog` label at x 417.6. */
  psychologistName: {
    x: 348.4,
    top: 702,
    size: 18,
    weight: 700,
    maxWidth: 160,
    align: 'center',
  },
  /** Continues the baked `SIPP NO ` prefix, one word space after it. */
  sippNumber: {
    x: 414.5,
    top: 721.8,
    size: 18,
    weight: 700,
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
    // 382 is where the row *should* sit, but the template prints this row's
    // colon and placeholder 3.9 pt lower than its "Alamat" label. The colon is
    // baked into the background, so the value follows it; a value on the label
    // line would leave a colon floating on its own below.
    { key: 'address', top: 385.9 },
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
