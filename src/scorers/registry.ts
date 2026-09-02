import { z } from 'zod';
import type { ScorerType } from './schemas';
import {
  DiscItemContentSchema,
  DiscResponseSchema,
  DISC_PATTERN_CATALOG,
} from './schemas/forced-choice-disc';
import type {
  DiscItemContent,
  DiscResponse,
} from './schemas/forced-choice-disc';

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

/**
 * Deterministic test double until feature 05 ships the real DISC scorer.
 * Tallies most/least per letter (using the hidden mapping) and picks the
 * top most-letter as patternCode.
 */
function stubDiscScore(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
}): Promise<ScorerOutput> {
  const itemById = new Map<string, DiscItemContent>();
  for (const item of input.items) {
    itemById.set(item.id, item.content as DiscItemContent);
  }
  const most: Record<string, number> = { D: 0, I: 0, S: 0, C: 0 };
  const least: Record<string, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const response of input.responses) {
    const content = itemById.get(response.itemId);
    if (!content) continue;
    const value = response.value as DiscResponse;
    most[content.mapping[value.most]] += 1;
    least[content.mapping[value.least]] += 1;
  }
  const patternCode = Object.keys(most).sort((a, b) => most[b] - most[a])[0];
  return Promise.resolve({ scores: { most, least }, patternCode });
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
    score: stubDiscScore,
  },
};

export function getScorer(scorerType: string): Scorer | null {
  return SCORERS[scorerType as ScorerType] ?? null;
}
