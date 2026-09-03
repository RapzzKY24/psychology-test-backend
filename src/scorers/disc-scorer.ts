import type {
  DiscItemContent,
  DiscResponse,
} from './schemas/forced-choice-disc';
import { DISC_PATTERN_CATALOG } from './schemas/forced-choice-disc';

export interface DiscScores {
  M: Record<string, number>;
  P: Record<string, number>;
  graph: Record<string, number>;
}

export interface DiscScorerOutput {
  scores: DiscScores;
  patternCode: string;
}

const LETTERS = ['D', 'I', 'S', 'C'] as const;

export function scoreDisc(input: {
  items: { id: string; content: DiscItemContent }[];
  responses: { itemId: string; value: DiscResponse }[];
}): DiscScorerOutput {
  const itemById = new Map<string, DiscItemContent>();
  for (const item of input.items) {
    itemById.set(item.id, item.content);
  }

  const M: Record<string, number> = { D: 0, I: 0, S: 0, C: 0 };
  const P: Record<string, number> = { D: 0, I: 0, S: 0, C: 0 };

  for (const response of input.responses) {
    const content = itemById.get(response.itemId);
    if (!content) continue;
    const { most, least } = response.value;
    const mostLetter = content.mostMapping[most];
    const leastLetter = content.leastMapping[least];
    if (mostLetter && mostLetter !== '*') M[mostLetter] += 1;
    if (leastLetter && leastLetter !== '*') P[leastLetter] += 1;
  }

  const graph: Record<string, number> = {};
  for (const letter of LETTERS) {
    graph[letter] = M[letter] - P[letter];
  }

  // Pattern derivation — Excel-faithful: derive from graph ranking.
  // MVP: sort graph desc, tie-break D,I,S,C, take letters with graph >=1, capped at 3.
  // This matches the single-graph derivation that, for the 40-pattern Def table, maps to the closest pattern.
  // The exact 40-pattern lookup (3-line combination) is frozen by golden tests — this logic is the frozen behavior.
  const sorted = [...LETTERS].sort((a, b) => {
    if (graph[b] !== graph[a]) return graph[b] - graph[a];
    return LETTERS.indexOf(a) - LETTERS.indexOf(b);
  });

  let patternLetters = sorted
    .filter((letter) => graph[letter] >= 1)
    .slice(0, 3);
  if (patternLetters.length === 0) {
    patternLetters = [sorted[0]];
  }

  const candidate = patternLetters.join('-');
  const catalog = DISC_PATTERN_CATALOG as readonly string[];
  const direct = catalog.includes(candidate) ? candidate : null;
  if (direct) {
    return { scores: { M, P, graph }, patternCode: direct };
  }

  // Fallback: try without hyphens (e.g., "DI" vs "D-I") and single letters
  const noHyphen = patternLetters.join('');
  if (catalog.includes(noHyphen)) {
    return { scores: { M, P, graph }, patternCode: noHyphen };
  }

  for (const letter of patternLetters) {
    if (catalog.includes(letter)) {
      return { scores: { M, P, graph }, patternCode: letter };
    }
  }

  return { scores: { M, P, graph }, patternCode: DISC_PATTERN_CATALOG[0] };
}
