import {
  ageBandFor,
  convertGe,
  iqFor,
  parseMultiSubtestConfig,
  parseMultiSubtestItem,
  standardScoreRow,
  type MultiSubtestConfig,
  type MultiSubtestSection,
} from './schemas/multi-subtest';

export interface MultiSubtestSectionScore {
  code: string;
  name: string;
  /** Correct answers, before any GE conversion. */
  correct: number;
  /** Items the participant answered at all. */
  answered: number;
  items: number;
  /** The value the standard table is read with (GE: the converted 1–20). */
  raw: number;
  standardScore: number | null;
  category: string | null;
}

export interface MultiSubtestScores {
  ageBand: string | null;
  sections: MultiSubtestSectionScore[];
  /** Sum of the nine raws, each already on the 0–20 scale. */
  totalRaw: number;
  iq: number | null;
  iqCategory: string | null;
  /** Exact / Non Eksak / Seimbang, the workbook's "Dominasi". */
  dominance: string | null;
  /** |(GE + RA) − (AN + ZR)| in standard-score points. */
  dominanceGap: number | null;
}

/**
 * The workbook labels each standard score in six bands. The cut-offs are the
 * ones in its category formula, read straight off the sheet.
 */
export function standardScoreCategory(sw: number): string {
  if (sw <= 80) return 'Sangat Rendah';
  if (sw <= 94) return 'Rendah';
  if (sw <= 99) return 'Sedang';
  if (sw <= 104) return 'Cukup';
  if (sw <= 118) return 'Tinggi';
  return 'Sangat Tinggi';
}

/** The workbook's IQ labels, same formula. */
export function iqCategory(iq: number): string {
  if (iq <= 65) return 'Mentally Defective';
  if (iq <= 79) return 'Borderline Defective';
  if (iq <= 90) return 'Low Average';
  if (iq <= 110) return 'Average';
  if (iq <= 119) return 'High Average';
  if (iq <= 127) return 'Superior';
  if (iq <= 139) return 'Very Superior';
  return 'Genius';
}

/** Lowercase, punctuation to spaces, single spaces — the rubric's own words. */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A rubric term matches when the answer says it as a word or a phrase. The
 * answer sheet lets the examiner pick the closest row, so an answer longer than
 * the term ("bunga mawar" for "bunga") still counts; it never counts when the
 * term is only a fragment of a word.
 */
function says(answer: string, term: string): boolean {
  const needle = normalizeAnswer(term);
  if (!needle) return false;
  return new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'u').test(
    answer,
  );
}

/** What one GE answer is worth: 2, 1, or 0 for "tidak cocok". */
export function scoreGeAnswer(
  config: MultiSubtestConfig,
  itemOrder: number,
  answer: string,
): number {
  const row = config.geRubric[String(itemOrder)];
  if (!row) return 0;
  const text = normalizeAnswer(answer);
  if (!text) return 0;
  if (row.score2.some((term) => says(text, term))) return 2;
  if (row.score1.some((term) => says(text, term))) return 1;
  return 0;
}

/**
 * Numbers are compared by value, so "1.050" and "1050" agree. Participants
 * type Indonesian notation, where a dot groups thousands and a comma is the
 * decimal point, but a lone dot before one or two digits is still read as a
 * decimal because that is the only thing it can mean.
 */
function numberAnswer(value: string): number | null {
  let cleaned = value.replace(/\s+/g, '');
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function rawOfSection(
  config: MultiSubtestConfig,
  section: MultiSubtestSection,
  items: { id: string; order: number; content: unknown }[],
  answers: Map<string, string>,
): { correct: number; answered: number } {
  let correct = 0;
  let answered = 0;
  for (const item of items) {
    const content = parseMultiSubtestItem(item.content);
    if (!content) continue;
    const answer = answers.get(item.id);
    if (answer === undefined) continue;
    answered += 1;

    if (content.kind === 'CHOICE' || content.kind === 'IMAGE') {
      if (normalizeAnswer(answer) === content.key) correct += 1;
      continue;
    }
    if (content.kind === 'NUMBER') {
      const value = numberAnswer(answer);
      if (value !== null && value === content.key) correct += 1;
      continue;
    }
    if (section.code === 'GE') {
      correct += scoreGeAnswer(config, item.order, answer);
    }
  }
  return { correct, answered };
}

/**
 * Scores the whole battery.
 *
 * The chain is the workbook's: each subtest's raw goes through its own
 * standard-score row for the participant's age band, the nine raws are summed,
 * and the sum is read against the band's total table. GE is the exception the
 * source itself makes — its rubric runs to 32, so it is converted to the 1–20
 * scale before it joins the total.
 */
export function scoreMultiSubtest(input: {
  items: { id: string; order?: number; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
  ageMonths?: number | null;
}): { scores: MultiSubtestScores; patternCode: string } {
  const config = parseMultiSubtestConfig(input.scoringConfig);
  if (!config) throw new Error('multi-subtest: scoringConfig is missing');

  const answers = new Map<string, string>();
  for (const response of input.responses) {
    const value = response.value as { answer?: unknown } | null;
    if (value && typeof value.answer === 'string') {
      answers.set(response.itemId, value.answer);
    }
  }

  const ordered = input.items
    .map((item, index) => ({ ...item, order: item.order ?? index + 1 }))
    .sort((a, b) => a.order - b.order);

  const ageMonths = input.ageMonths ?? null;
  const band = ageMonths === null ? null : ageBandFor(config, ageMonths);

  const sections: MultiSubtestSectionScore[] = [];
  let totalRaw = 0;
  let cursor = 0;

  for (const section of config.subtests) {
    const slice = ordered.slice(cursor, cursor + section.itemCount);
    cursor += section.itemCount;

    const { correct, answered } = rawOfSection(
      config,
      section,
      slice,
      answers,
    );
    // GE is the only subtest whose printed rubric can exceed the 0–20 scale.
    const raw = section.code === 'GE' ? convertGe(config, correct) : correct;
    totalRaw += raw;

    const standardScore =
      band === null ? null : standardScoreRow(config, band, section.code, raw);

    sections.push({
      code: section.code,
      name: section.name,
      correct,
      answered,
      items: section.itemCount,
      raw,
      standardScore,
      category:
        standardScore === null ? null : standardScoreCategory(standardScore),
    });
  }

  const iq = band === null ? null : iqFor(config, band, totalRaw);

  const sw = (code: string): number | null =>
    sections.find((section) => section.code === code)?.standardScore ?? null;
  const exact = (sw('GE') ?? 0) + (sw('RA') ?? 0);
  const nonExact = (sw('AN') ?? 0) + (sw('ZR') ?? 0);
  const gap = Math.abs(exact - nonExact);
  const dominance =
    band === null
      ? null
      : gap <= config.dominanceBalancedWithin
        ? 'Seimbang'
        : exact > nonExact
          ? 'Eksak'
          : 'Non Eksak';

  return {
    scores: {
      ageBand: band,
      sections,
      totalRaw,
      iq,
      iqCategory: iq === null ? null : iqCategory(iq),
      dominance,
      dominanceGap: band === null ? null : gap,
    },
    patternCode: 'IST',
  };
}
