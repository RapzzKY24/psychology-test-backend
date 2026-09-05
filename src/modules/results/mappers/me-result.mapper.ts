import type { ApprovedResultRow } from '../repository/results.repository';
import type { MeResultListItemDto } from '../dto/me-result.dto';

/**
 * Maps an approved-result row to the dashboard list item (feature 08
 * §API contract). `patternCode` is the effective one (feature 06):
 * corrected ?? system.
 */
export function toMeResultListItemDto(
  row: ApprovedResultRow,
): MeResultListItemDto {
  return {
    attemptId: row.attemptId,
    testName: row.testName,
    patternCode: row.correctedPatternCode ?? row.patternCode,
    completedAt: row.completedAt,
    approvedAt: row.approvedAt,
  };
}
