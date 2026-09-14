import { z } from 'zod';
import type { ScorerType } from './schemas';
import {
  DiscItemContentSchema,
  DiscResponseSchema,
  DISC_PATTERN_CATALOG,
} from './schemas/forced-choice-disc';
import {
  RightWrongItemContentSchema,
  RightWrongResponseSchema,
  RIGHT_WRONG_PATTERN_CATALOG,
} from './schemas/right-wrong-norm';
import { scoreDisc } from './disc-scorer';
import { scoreRightWrongNorm } from './right-wrong-norm';

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
  RIGHT_WRONG_NORM: {
    type: 'RIGHT_WRONG_NORM',
    itemSchema: RightWrongItemContentSchema,
    responseSchema: RightWrongResponseSchema,
    sanitize: (content) => {
      const parsed = RightWrongItemContentSchema.safeParse(content);
      if (!parsed.success) return {};
      const { correctIndex, ...rest } = parsed.data;
      void correctIndex;
      return rest as Record<string, unknown>;
    },
    patternCatalog: [...RIGHT_WRONG_PATTERN_CATALOG],
    score: (input) =>
      Promise.resolve(
        scoreRightWrongNorm(
          input as unknown as Parameters<typeof scoreRightWrongNorm>[0],
        ) as unknown as ScorerOutput,
      ),
  },
};

export function getScorer(scorerType: string): Scorer | null {
  return SCORERS[scorerType as ScorerType] ?? null;
}
