import { z } from 'zod';
import { DiscItemContentSchema } from './forced-choice-disc';

export const ScorerSchemas = {
  FORCED_CHOICE_DISC: DiscItemContentSchema,
} as const;

export type ScorerType = keyof typeof ScorerSchemas;

export function getItemSchema(scorerType: string): z.ZodSchema | null {
  return (ScorerSchemas as Record<string, z.ZodSchema>)[scorerType] ?? null;
}
