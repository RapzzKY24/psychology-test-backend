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
    // Runs to the orange rule's right end (554) so a long test name such as
    // `TES KRAEPELIN` is not clipped by `.slot { overflow: hidden }`.
    maxWidth: 200,
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
    weight: 700,
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
    maxWidth: 190,
    align: 'left',
  },
  /**
   * The whole `<verdict> untuk <purpose>.` sentence. The template mixes
   * weights inside this line — the verdict and the purpose are Bold, the word
   * "untuk" between them is Regular — so `weight` is the base and the renderer
   * marks the two bold runs up.
   */
  // Centred on the baked `Bahwa yang bersangkutan;` line above it, whose ink
  // box spans 233.1-389.7 (centre 311.4). x = 311.4 - maxWidth / 2.
  verdict: {
    x: 121.05,
    top: 513,
    size: 18,
    weight: 400,
    maxWidth: 380.7,
    align: 'center',
  },
  /**
   * `<KOTA>, <tanggal>` above the sign-off block, centred on the same axis as
   * the baked `Psikolog` (SIGNOFF_CENTRE_X). The template prints the city
   * SemiBold and the date Bold; one weight for the line reads better than a
   * seam in the middle of it, so both are SemiBold. 220 pt wide so a long city
   * such as `Tangerang Selatan, 16 November 2026` is not clipped.
   */
  cityDate: {
    x: 297.6,
    top: 587.5,
    size: 18,
    weight: 600,
    maxWidth: 240,
    align: 'center',
  },
  /**
   * Centred on the baked `Psikolog` label (ink box 390.1-445.2, centre 417.6).
   * The old box was 348.4 + 160 / 2 = 428.4, i.e. 10.8 pt right of the axis.
   */
  psychologistName: {
    x: 327.6,
    top: 702,
    size: 18,
    weight: 700,
    maxWidth: 180,
    align: 'center',
  },
  /**
   * Continues the baked `SIPP NO ` prefix, one word space after it. The label
   * is baked left-anchored, so the line cannot be centred on the axis without
   * regenerating the template; 135 pt keeps a full `SIPP-...` number inside
   * the page margin instead of clipping it at 96 pt.
   */
  sippNumber: {
    x: 414.5,
    top: 721.8,
    size: 18,
    weight: 700,
    maxWidth: 139,
    align: 'left',
  },
} as const satisfies Record<string, TextSlot>;

/**
 * The six identity rows. The labels are baked into the template; the colons
 * are NOT: the original template printed five colons at an 18.75 pt pitch
 * against labels at a 14.2 pt pitch, so they drifted further from their rows
 * with every line and the sixth row had none. They were erased from
 * template.png and the renderer draws one per row at the label's own `top`,
 * so label, colon and value share a baseline by construction.
 */
export const IDENTITY = {
  /** Colon column: a 7 pt box centred on x 337.1 (where the baked ones were). */
  colon: { x: 333.6, width: 7 },
  /** Left edge of the value column, measured from the placeholder run. */
  valueX: 346.6,
  /** Width available before the template's right margin (554 - 346.6). */
  valueWidth: 207,
  /**
   * Room for a wrapped address between its row (381.7) and the orange rule at
   * y 451. The renderer shrinks the font to fit rather than running over it.
   */
  addressMaxHeight: 62,
  size: 18,
  weight: 600,
  /** Row tops = the baked label tops, from `pdftotext -bbox` of the template. */
  rows: [
    { key: 'fullName', top: 310.1 },
    { key: 'idNumber', top: 324.0 },
    { key: 'gender', top: 338.6 },
    { key: 'birthPlaceDate', top: 352.5 },
    { key: 'age', top: 367.1 },
    { key: 'address', top: 381.7 },
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
   * The bracket (68.5, 302.2, 101.8 x 115.3) is drawn on three sides only; the
   * bottom edge is open. The photo is inset 4 pt from it on the left, top and
   * right so the gold frame stays visible around the picture, as in the
   * designer's mock-up, instead of being painted over.
   */
  photo: { x: 72.5, y: 306.2, width: 93.8, height: 111.3 },
  /**
   * The band between `Psikolog` (ends 623.3) and the psychologist's name
   * (starts 702.0), centred on SIGNOFF_CENTRE_X (327.6 + 180 / 2 = 417.6).
   * The scan is scaled to fit, never placed at its natural size.
   */
  signature: { x: 327.6, y: 625.5, width: 180, height: 74 },
  /**
   * Centred on the baked `VALIDASI SERTIFIKAT` caption (ink box 97.9-168.3,
   * centre 133.1, top 664.5) with a 5 pt gap above it.
   */
  qr: { x: 102.1, y: 597.5, width: 62, height: 62 },
} as const satisfies Record<string, ImageSlot>;

/** Centre of the sign-off column, i.e. the centre of the baked `Psikolog`. */
export const SIGNOFF_CENTRE_X = 417.6;
