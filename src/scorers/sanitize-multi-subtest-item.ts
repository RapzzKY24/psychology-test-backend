import { parseMultiSubtestItem } from './schemas/multi-subtest';

/**
 * What the participant may see. The key never leaves the server: the choice
 * subtests would be trivially cheatable from the browser's network tab
 * otherwise, and the figure subtests ship the answer as a letter too.
 */
export function sanitizeMultiSubtestItem(
  content: unknown,
): Record<string, unknown> {
  const item = parseMultiSubtestItem(content);
  if (!item) return {};

  switch (item.kind) {
    case 'CHOICE':
      return { kind: item.kind, prompt: item.prompt, options: item.options };
    case 'IMAGE':
      return { kind: item.kind, imageUrl: item.imageUrl };
    case 'PAIR':
      return { kind: item.kind, words: item.words };
    case 'NUMBER':
      return item.series
        ? { kind: item.kind, series: item.series }
        : { kind: item.kind, prompt: item.prompt ?? '' };
  }
}
