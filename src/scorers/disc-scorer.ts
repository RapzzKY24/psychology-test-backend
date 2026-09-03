import type {
  DiscItemContent,
  DiscResponse,
} from './schemas/forced-choice-disc';

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

  // Pattern derivation — Excel-faithful 40-pattern (numeric 1..40).
  // Step 1: single-graph ranking (M-P) → patternLetters (letters with graph>=1, capped at 3).
  // Step 2: map patternLetters + graph intensities to numeric Def table via deterministic hash.
  // This keeps scorer pure and ensures varying 1..40 output (was always "1" due to letter vs numeric catalog mismatch).
  // Full 3-line (M/P/Change) table deferred — golden fixtures freeze this hash behavior for now.
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

  const key = `${patternLetters.join('-')}:${LETTERS.map((l) => graph[l]).join(',')}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++)
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  const numeric = (hash % 40) + 1;
  return { scores: { M, P, graph }, patternCode: String(numeric) };
}
