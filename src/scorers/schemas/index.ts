import { z } from 'zod';
import { DiscItemContentSchema } from './forced-choice-disc';
import { RightWrongItemContentSchema } from './right-wrong-norm';

export const ScorerSchemas = {
  FORCED_CHOICE_DISC: DiscItemContentSchema,
  RIGHT_WRONG_NORM: RightWrongItemContentSchema,
} as const;

export type ScorerType = keyof typeof ScorerSchemas;

export function getItemSchema(scorerType: string): z.ZodSchema | null {
  return (ScorerSchemas as Record<string, z.ZodSchema>)[scorerType] ?? null;
}
