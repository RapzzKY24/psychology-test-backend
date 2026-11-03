/**
 * `060/TES-KRAEPELIN/YM/XI/2026` -> `Sertifikat-060-TES-KRAEPELIN-YM-XI-2026.pdf`
 *
 * The slashes have to go: a filename with a path separator in it is either
 * rejected by the browser or silently splits the download.
 */
export function certificateFileName(number: string): string {
  const slug = number.replace(/[\\/:*?"<>|]/g, '-');
  return `Sertifikat-${slug}.pdf`;
}

/** A draft is previewed, never downloaded as a numbered certificate. */
export const DRAFT_CERTIFICATE_FILENAME = 'Draf-Sertifikat.pdf';
