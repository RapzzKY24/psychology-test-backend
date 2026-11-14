import { z } from 'zod';
import type { ScorerType } from './schemas';
import {
  ChoiceTallyItemContentSchema,
  ChoiceTallyResponseSchema,
  choiceTallyPatternCodes,
} from './schemas/choice-tally';
import {
  DiscItemContentSchema,
  DiscResponseSchema,
  DISC_PATTERN_CATALOG,
} from './schemas/forced-choice-disc';
import {
  PairItemContentSchema,
  PairResponseSchema,
  pairPatternCodes,
} from './schemas/forced-choice-pair';
import {
  RightWrongItemContentSchema,
  RightWrongResponseSchema,
  RIGHT_WRONG_PATTERN_CATALOG,
} from './schemas/right-wrong-norm';
import {
  ScaleTallyItemContentSchema,
  ScaleTallyResponseSchema,
  scaleTallyPatternCodes,
} from './schemas/scale-tally';
import { scoreChoiceTally } from './choice-tally';
import { scoreDisc } from './disc-scorer';
import { scoreForcedChoicePair } from './forced-choice-pair';
import { scoreRightWrongNorm } from './right-wrong-norm';
import { scoreScaleTally } from './scale-tally';
import { sanitizeChoiceTallyItem } from './sanitize-choice-tally-item';
import { sanitizePairItem } from './sanitize-pair-item';
import { sanitizeRightWrongItem } from './sanitize-right-wrong-item';
import { sanitizeScaleTallyItem } from './sanitize-scale-tally-item';

export interface ScorerOutput {
  scores: Record<string, unknown>;
  patternCode: string;
}

export interface Scorer {
  type: ScorerType;
  itemSchema: z.ZodSchema;
  responseSchema: z.ZodSchema;
  sanitize(content: unknown): Record<string, unknown>;
  /** Fixed codes (DISC, raw scores). Empty when the codes depend on the items. */
  patternCatalog: string[];
  /**
   * Codes this particular item set can produce. Publish requires one
   * interpretation per code; a family whose pattern is assembled from the
   * dimensions (FORCED_CHOICE_PAIR) derives them instead of listing 16+ by hand.
   */
  patternCodesFor?(items: { content: unknown }[]): string[];
  score(input: {
    items: { id: string; content: unknown }[];
    responses: { itemId: string; value: unknown }[];
    /** Optional conversion table carried by the test (raw -> IQ). */
    normTable?: unknown;
    /** Family settings the items do not carry (e.g. a tally tie-break). */
    scoringConfig?: unknown;
  }): Promise<ScorerOutput>;
}

export const SCORERS: Record<ScorerType, Scorer> = {
  CHOICE_TALLY: {
    type: 'CHOICE_TALLY',
    itemSchema: ChoiceTallyItemContentSchema,
    responseSchema: ChoiceTallyResponseSchema,
    sanitize: sanitizeChoiceTallyItem,
    patternCatalog: [],
    patternCodesFor: choiceTallyPatternCodes,
    score: (input) =>
      Promise.resolve(scoreChoiceTally(input) as unknown as ScorerOutput),
  },
  FORCED_CHOICE_DISC: {
    type: 'FORCED_CHOICE_DISC',
    itemSchema: DiscItemContentSchema,
    responseSchema: DiscResponseSchema,
    sanitize: (content) => {
      const parsed = DiscItemContentSchema.safeParse(content);
      if (!parsed.success) return {};
      return { words: parsed.data.words };
    },
    patternCatalog: [...DISC_PATTERN_CATALOG],
    score: (input) =>
      Promise.resolve(
        scoreDisc(
          input as unknown as Parameters<typeof scoreDisc>[0],
        ) as unknown as ScorerOutput,
      ),
  },
  FORCED_CHOICE_PAIR: {
    type: 'FORCED_CHOICE_PAIR',
    itemSchema: PairItemContentSchema,
    responseSchema: PairResponseSchema,
    sanitize: sanitizePairItem,
    patternCatalog: [],
    patternCodesFor: pairPatternCodes,
    score: (input) =>
      Promise.resolve(scoreForcedChoicePair(input) as unknown as ScorerOutput),
  },
  RIGHT_WRONG_NORM: {
    type: 'RIGHT_WRONG_NORM',
    itemSchema: RightWrongItemContentSchema,
    responseSchema: RightWrongResponseSchema,
    sanitize: sanitizeRightWrongItem,
    patternCatalog: [...RIGHT_WRONG_PATTERN_CATALOG],
    score: (input) =>
      Promise.resolve(scoreRightWrongNorm(input) as unknown as ScorerOutput),
  },
  SCALE_TALLY: {
    type: 'SCALE_TALLY',
    itemSchema: ScaleTallyItemContentSchema,
    responseSchema: ScaleTallyResponseSchema,
    sanitize: sanitizeScaleTallyItem,
    patternCatalog: [],
    patternCodesFor: scaleTallyPatternCodes,
    score: (input) =>
      Promise.resolve(scoreScaleTally(input) as unknown as ScorerOutput),
  },
};

export function getScorer(scorerType: string): Scorer | null {
  return SCORERS[scorerType as ScorerType] ?? null;
}
