/**
 * Fallbacks for the `Setting` keys this feature owns. They keep report
 * generation working before `seed:report-settings` has ever run — the printed
 * institution name must never come out blank.
 */
export const REPORT_SETTING_KEYS = {
  institutionName: 'report.institution_name',
  institutionCode: 'report.institution_code',
} as const;

export const DEFAULT_INSTITUTION_NAME = 'YULIARPAN MEDIKA/ETP';
export const DEFAULT_INSTITUTION_CODE = 'YM';
