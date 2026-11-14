import { z } from 'zod';
import type { ScorerType } from './schemas';
import {
  ChoiceTallyConfigSchema,
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
import { pairTallyPatternCodes } from './schemas/pair-tally';
import { PairTallyConfigSchema } from './schemas/pair-tally';
import {
  LikertConfigSchema,
  LikertItemContentSchema,
  LikertResponseSchema,
  likertPatternCodes,
  likertResponseSchema,
} from './schemas/likert';
import {
  RankGroupItemContentSchema,
  RankGroupResponseSchema,
  rankGroupPatternCodes,
  rankGroupResponseSchema,
} from './schemas/rank-group';
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
import { scorePairTally } from './pair-tally';
import { scoreLikert } from './likert';
import { scoreRankGroup } from './rank-group';
import { scoreRightWrongNorm } from './right-wrong-norm';
import { scoreScaleTally } from './scale-tally';
import { sanitizeChoiceTallyItem } from './sanitize-choice-tally-item';
import { sanitizePairItem } from './sanitize-pair-item';
import { sanitizeLikertItem } from './sanitize-likert-item';
import { sanitizeRankGroupItem } from './sanitize-rank-group-item';
import { sanitizeRightWrongItem } from './sanitize-right-wrong-item';
import { sanitizeScaleTallyItem } from './sanitize-scale-tally-item';

export interface ScorerOutput {
  scores: Record<string, unknown>;
  patternCode: string;
}

/** Participant facts a `sanitize` implementation may need. */
export interface SanitizeContext {
  /** `MALE` / `FEMALE` once the attempt recorded it; null before. */
  gender?: string | null;
}

export interface Scorer {
  type: ScorerType;
  itemSchema: z.ZodSchema;
  /** The family-wide answer shape. Narrowed per test by `responseSchemaFor`. */
  responseSchema: z.ZodSchema;
  /**
   * The answer shape for **one** test, when the bounds live in
   * `scoringConfig` rather than in the item (LIKERT's `ratingRange`) or in the
   * item itself (RANK_GROUP's option count). Without it a rating outside the
   * test's scale would be stored and then ignored by the scorer — the
   * participant would see an answered item that scored 0.
   */
  responseSchemaFor?(
    scoringConfig?: unknown,
    itemContent?: unknown,
  ): z.ZodSchema;
  /**
   * Shape of `Test.scoringConfig` for this family. The config is seed-owned
   * and never edited from the admin UI, so a misspelled key is otherwise
   * dropped on parse and the family quietly falls back to its defaults —
   * publish and the seed guard parse it here instead.
   */
  configSchema?: z.ZodSchema;
  /**
   * What the participant sees. `context` carries the participant facts the
   * rendering depends on — RMIB shows the occupation list matching their sex.
   */
  sanitize(
    content: unknown,
    scoringConfig?: unknown,
    context?: SanitizeContext,
  ): Record<string, unknown>;
  /** Fixed codes (DISC, raw scores). Empty when the codes depend on the items. */
  patternCatalog: string[];
  /**
   * Codes this particular item set can produce. Publish requires one
   * interpretation per code; a family whose pattern is assembled from the
   * dimensions (FORCED_CHOICE_PAIR) derives them instead of listing 16+ by hand.
   * `scoringConfig` is passed because a banded family (LIKERT) needs the band
   * labels to know the full code set.
   */
  patternCodesFor?(
    items: { content: unknown }[],
    scoringConfig?: unknown,
  ): string[];
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
    configSchema: ChoiceTallyConfigSchema,
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
  LIKERT: {
    type: 'LIKERT',
    itemSchema: LikertItemContentSchema,
    responseSchema: LikertResponseSchema,
    responseSchemaFor: likertResponseSchema,
    configSchema: LikertConfigSchema,
    sanitize: sanitizeLikertItem,
    patternCatalog: [],
    patternCodesFor: likertPatternCodes,
    score: (input) =>
      Promise.resolve(scoreLikert(input) as unknown as ScorerOutput),
  },
  PAIR_TALLY: {
    type: 'PAIR_TALLY',
    itemSchema: PairItemContentSchema,
    responseSchema: PairResponseSchema,
    configSchema: PairTallyConfigSchema,
    sanitize: sanitizePairItem,
    patternCatalog: [],
    patternCodesFor: pairTallyPatternCodes,
    score: (input) =>
      Promise.resolve(scorePairTally(input) as unknown as ScorerOutput),
  },
  RANK_GROUP: {
    type: 'RANK_GROUP',
    itemSchema: RankGroupItemContentSchema,
    responseSchema: RankGroupResponseSchema,
    responseSchemaFor: (_scoringConfig, itemContent) =>
      rankGroupResponseSchema(itemContent),
    sanitize: sanitizeRankGroupItem,
    patternCatalog: [],
    patternCodesFor: rankGroupPatternCodes,
    score: (input) =>
      Promise.resolve(scoreRankGroup(input) as unknown as ScorerOutput),
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

/**
 * The answer schema for one test: the family's per-test narrowing when it has
 * one, the family-wide shape otherwise. `itemContent` is passed because some
 * families size the answer from the item rather than from the test config.
 */
export function getResponseSchema(
  scorer: Scorer,
  scoringConfig?: unknown,
  itemContent?: unknown,
): z.ZodSchema {
  return (
    scorer.responseSchemaFor?.(scoringConfig, itemContent) ??
    scorer.responseSchema
  );
}

/**
 * Problems with a test's `scoringConfig`, each as `scoringConfig.<path>: message`.
 *
 * A missing config is valid — every family with settings also has a default.
 * A family without a `configSchema` ignores whatever it is given, so it reports
 * nothing: rejecting stray data there would fail tests that predate the column.
 */
export function scoringConfigIssues(
  scorer: Scorer,
  scoringConfig: unknown,
): string[] {
  if (scoringConfig == null || !scorer.configSchema) return [];
  const parsed = scorer.configSchema.safeParse(scoringConfig);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.length
      ? `scoringConfig.${issue.path.join('.')}`
      : 'scoringConfig';
    return `${path}: ${issue.message}`;
  });
}
