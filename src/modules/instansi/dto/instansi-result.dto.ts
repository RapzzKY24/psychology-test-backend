import { z } from 'zod';
import type { InstitutionResultRow } from '../../results/repository/results.repository';

export const InstansiResultItemSchema = z.object({
  resultId: z.string(),
  participantName: z.string(),
  testName: z.string(),
  patternCode: z.string(),
  scores: z.unknown(),
  approvedAt: z.coerce.date().nullable(),
});

export type InstansiResultItemDto = z.infer<typeof InstansiResultItemSchema>;

export function toInstansiResultItem(
  row: InstitutionResultRow,
): InstansiResultItemDto {
  return {
    resultId: row.resultId,
    participantName: row.participantName,
    testName: row.testName,
    patternCode: row.patternCode,
    scores: row.scores,
    approvedAt: row.approvedAt,
  };
}
