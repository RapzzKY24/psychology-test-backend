import {
  NormTableSchema,
  parseRightWrongItem,
  parseRightWrongResponse,
} from './schemas/right-wrong-norm';
import type { NormEntry } from './schemas/right-wrong-norm';
import { answersMatch, sameIndexSet } from './utils/answer-match';

export interface RightWrongScores {
  raw: number;
  total: number;
  perItem: boolean[];
  /** Present only when the test carries a norm table. */
  iq?: number;
}

export interface RightWrongScorerOutput {
  scores: RightWrongScores;
  patternCode: string;
}

function isCorrect(content: unknown, value: unknown): boolean {
  const item = parseRightWrongItem(content);
  const response = parseRightWrongResponse(value);
  if (!item || !response) return false;

  if (item.answerMode === 'short') {
    if (!('text' in response)) return false;
    return item.accepted.some((variant) =>
      answersMatch(response.text, variant),
    );
  }
  if (!('chosen' in response)) return false;
  return sameIndexSet(response.chosen, item.correctIndexes);
}

function parseNormTable(normTable: unknown): NormEntry[] | null {
  if (!normTable) return null;
  const parsed = NormTableSchema.safeParse(normTable);
  return parsed.success ? parsed.data : null;
}

function lookupIq(normTable: NormEntry[], raw: number): number | undefined {
  const sorted = [...normTable].sort((a, b) => a.raw - b.raw);
  let found: number | undefined;
  for (const row of sorted) {
    if (row.raw === raw) return row.iq;
    if (row.raw < raw) found = row.iq;
  }
  return found;
}

export function scoreRightWrongNorm(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  normTable?: unknown;
}): RightWrongScorerOutput {
  const responseByItem = new Map<string, unknown>();
  for (const response of input.responses) {
    responseByItem.set(response.itemId, response.value);
  }

  const perItem: boolean[] = [];
  let raw = 0;
  const total = input.items.length;

  // Unanswered items score as wrong: a timed test is submitted at the buzzer,
  // not only when every field is filled.
  for (const item of input.items) {
    const ok = isCorrect(item.content, responseByItem.get(item.id));
    perItem.push(ok);
    if (ok) raw += 1;
  }

  const scores: RightWrongScores = { raw, total, perItem };
  const normTable = parseNormTable(input.normTable);
  const iq = normTable ? lookupIq(normTable, raw) : undefined;
  if (iq !== undefined) scores.iq = iq;

  return {
    scores,
    patternCode: `RAW_${raw}`,
  };
}
