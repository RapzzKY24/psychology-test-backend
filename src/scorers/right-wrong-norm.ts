import type {
  RightWrongItemContent,
  RightWrongResponse,
} from './schemas/right-wrong-norm';

export interface RightWrongScores {
  raw: number;
  total: number;
  perItem: boolean[];
}

export interface RightWrongScorerOutput {
  scores: RightWrongScores;
  patternCode: string;
}

export function scoreRightWrongNorm(input: {
  items: { id: string; content: RightWrongItemContent }[];
  responses: { itemId: string; value: RightWrongResponse }[];
}): RightWrongScorerOutput {
  const itemById = new Map<string, RightWrongItemContent>();
  for (const item of input.items) {
    itemById.set(item.id, item.content);
  }

  const perItem: boolean[] = [];
  let raw = 0;
  const total = input.items.length;

  for (const item of input.items) {
    const response = input.responses.find((r) => r.itemId === item.id);
    const correct = item.content.correctIndex;
    const chosen = response?.value.chosen;
    const isCorrect = typeof chosen === 'number' && chosen === correct;
    perItem.push(isCorrect);
    if (isCorrect) raw += 1;
  }

  return {
    scores: { raw, total, perItem },
    patternCode: `RAW_${raw}`,
  };
}
