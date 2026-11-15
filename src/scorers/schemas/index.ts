import { z } from 'zod';
import { ChoiceTallyItemContentSchema } from './choice-tally';
import { DiscItemContentSchema } from './forced-choice-disc';
import { PairItemContentSchema } from './forced-choice-pair';
import { LikertItemContentSchema } from './likert';
import { MarkGroupItemContentSchema } from './mark-group';
import { RankGroupItemContentSchema } from './rank-group';
import { RightWrongItemContentSchema } from './right-wrong-norm';
import { ScaleTallyItemContentSchema } from './scale-tally';
import { StyleGridItemContentSchema } from './style-grid';

export const ScorerSchemas = {
  CHOICE_TALLY: ChoiceTallyItemContentSchema,
  FORCED_CHOICE_DISC: DiscItemContentSchema,
  FORCED_CHOICE_PAIR: PairItemContentSchema,
  LIKERT: LikertItemContentSchema,
  MARK_GROUP: MarkGroupItemContentSchema,
  PAIR_TALLY: PairItemContentSchema,
  RANK_GROUP: RankGroupItemContentSchema,
  RIGHT_WRONG_NORM: RightWrongItemContentSchema,
  SCALE_TALLY: ScaleTallyItemContentSchema,
  STYLE_GRID: StyleGridItemContentSchema,
} as const;

export type ScorerType = keyof typeof ScorerSchemas;

/**
 * The family names as a runtime list, so the admin DTOs accept exactly the
 * families this build can score. Adding an entry above is enough — a hand-typed
 * enum in a DTO is how `LIKERT` and the tallies became uncreatable.
 */
export const ScorerTypeValues = Object.keys(ScorerSchemas) as [
  ScorerType,
  ...ScorerType[],
];

export function getItemSchema(scorerType: string): z.ZodSchema | null {
  return (ScorerSchemas as Record<string, z.ZodSchema>)[scorerType] ?? null;
}
