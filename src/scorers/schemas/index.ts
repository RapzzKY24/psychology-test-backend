import { z } from 'zod';
import { DiscItemContentSchema } from './forced-choice-disc';
import { PairItemContentSchema } from './forced-choice-pair';
import { RightWrongItemContentSchema } from './right-wrong-norm';
import { ScaleTallyItemContentSchema } from './scale-tally';

export const ScorerSchemas = {
  FORCED_CHOICE_DISC: DiscItemContentSchema,
  FORCED_CHOICE_PAIR: PairItemContentSchema,
  RIGHT_WRONG_NORM: RightWrongItemContentSchema,
  SCALE_TALLY: ScaleTallyItemContentSchema,
} as const;

export type ScorerType = keyof typeof ScorerSchemas;

export function getItemSchema(scorerType: string): z.ZodSchema | null {
  return (ScorerSchemas as Record<string, z.ZodSchema>)[scorerType] ?? null;
}
