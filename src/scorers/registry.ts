import { z } from 'zod';
import type { ScorerType } from './schemas';
import {
  DiscItemContentSchema,
  DiscResponseSchema,
  DISC_PATTERN_CATALOG,
} from './schemas/forced-choice-disc';
import { scoreDisc } from './disc-scorer';

export interface ScorerOutput {
  scores: Record<string, unknown>;
  patternCode: string;
}

export interface Scorer {
  type: ScorerType;
  itemSchema: z.ZodSchema;
  responseSchema: z.ZodSchema;
  sanitize(content: unknown): Record<string, unknown>;
  patternCatalog: string[];
  score(input: {
    items: { id: string; content: unknown }[];
    responses: { itemId: string; value: unknown }[];
  }): Promise<ScorerOutput>;
}

export const SCORERS: Record<ScorerType, Scorer> = {
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
};

export function getScorer(scorerType: string): Scorer | null {
  return SCORERS[scorerType as ScorerType] ?? null;
}
