import { RightWrongItemContentSchema } from './schemas/right-wrong-norm';

export function sanitizeRightWrongItem(content: unknown): Record<string, unknown> {
  const parsed = RightWrongItemContentSchema.safeParse(content);
  if (!parsed.success) return {};
  const { correctIndex, ...rest } = parsed.data;
  void correctIndex;
  return rest as Record<string, unknown>;
}
