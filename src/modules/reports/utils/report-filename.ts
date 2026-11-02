/** `050/PSIKOTES/YM/XI/2026` → `laporan-050-PSIKOTES-YM-XI-2026.pdf` */
export function reportFileName(number: string): string {
  const slug = number.replace(/[\\/:*?"<>|]/g, '-');
  return `laporan-${slug}.pdf`;
}
