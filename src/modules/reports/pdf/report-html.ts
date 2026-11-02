import { RATING_SECTIONS, RATING_VALUES } from '../rubric';
import type { RatingSection } from '../rubric';
import type { ReportSnapshot } from '../utils/report-snapshot';
import { formatIndonesianDate } from '../utils/format-indonesian-date';

/** Data URIs — the renderer never touches the filesystem. */
export interface ReportAssets {
  klinikLogo: string;
  etpLogo: string;
  mypsikologLogo: string;
  tagline: string;
  signature: string;
  qr: string;
}

export interface RenderReportParams {
  snapshot: ReportSnapshot;
  /** Stored on the row, not inside the snapshot. */
  number: string;
  assets: ReportAssets;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? escapeHtml(trimmed) : '-';
}

function narrative(snapshot: ReportSnapshot, key: string): string {
  const value = snapshot.narratives[key];
  if (!value || value.trim().length === 0) return '';
  return escapeHtml(value.trim()).replace(/\r?\n/g, '<br>');
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 10pt;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  position: relative;
  width: 210mm;
  height: 297mm;
  padding: 12mm 14mm 20mm;
  page-break-after: always;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; }

.doc-header { display: flex; align-items: flex-start; margin-bottom: 4mm; }
.logo-klinik { height: 14mm; }
.logo-etp { height: 10mm; margin-left: 6mm; margin-top: 1mm; }
.doc-footer { position: absolute; right: 14mm; bottom: 10mm; text-align: right; }
.logo-mypsikolog { height: 7mm; display: block; margin-left: auto; }
.tagline { height: 2.6mm; margin-top: 1mm; }

.rahasia {
  border: 0.4mm solid #1F4E79;
  color: #1F4E79;
  font-weight: bold;
  letter-spacing: 2mm;
  text-align: right;
  padding: 2mm 4mm;
  font-size: 12pt;
  margin-top: 18mm;
}
.cover-title {
  color: #1F4E79;
  font-size: 22pt;
  font-weight: bold;
  line-height: 1.35;
  margin-top: 26mm;
}
.cover-subtitle { font-style: italic; font-size: 10pt; margin-top: 4mm; }
.cover-number { font-size: 10pt; margin-top: 3mm; }
.cover-identity { margin-top: 16mm; width: 100%; border-collapse: collapse; }
.cover-identity td { padding: 1.2mm 0; font-size: 10pt; vertical-align: bottom; }
.cover-identity .label { width: 26mm; }
.cover-identity .sep { width: 4mm; }
.cover-identity .line { border-bottom: 0.25mm dashed #666; padding-left: 2mm; }
.qr-block { position: absolute; left: 14mm; bottom: 14mm; text-align: center; }
.qr-block img { width: 24mm; height: 24mm; }
.qr-block span { display: block; font-size: 7pt; color: #555; margin-top: 1mm; }

.resume-head { text-align: center; margin-bottom: 6mm; }
.resume-head h1 { font-size: 12pt; margin: 0; letter-spacing: 0.4mm; }
.resume-head h2 { font-size: 11pt; margin: 1mm 0 0; }
.resume-head p { font-size: 9pt; font-style: italic; margin: 1mm 0 0; }
.psy-block { margin-bottom: 6mm; }
.psy-block h3 { font-size: 10pt; margin: 0; }
.psy-block .en { font-size: 8pt; font-style: italic; margin: 0 0 2.5mm; }
.psy-row { display: flex; font-size: 9.5pt; margin-bottom: 1.4mm; }
.psy-label { width: 85mm; }
.psy-value { flex: 1; }

.section { margin-bottom: 4mm; }
.section-title { font-size: 10pt; font-weight: bold; margin: 0 0 1.5mm; }
table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.grid th, .grid td {
  border: 0.25mm solid #000;
  padding: 1.2mm 1.5mm;
  font-size: 8.5pt;
  vertical-align: top;
}
.grid thead th {
  background: #E6A0DC;
  font-weight: bold;
  text-align: center;
  vertical-align: middle;
}
.grid .c-letter { width: 8mm; text-align: center; vertical-align: middle; }
.grid .c-aspect { width: 38mm; }
.grid .c-cat { width: 8mm; text-align: center; vertical-align: middle; }
.grid td.cat { text-align: center; vertical-align: middle; font-weight: bold; }
.legend {
  border: 0.25mm solid #000;
  border-top: none;
  padding: 1.2mm 1.5mm;
  font-size: 8pt;
}
.conclusion {
  border: 0.25mm solid #000;
  margin-top: 1.5mm;
  height: 42mm;
  padding: 1.5mm 2mm;
  overflow: hidden;
}
.conclusion .label { font-weight: bold; font-size: 8.5pt; }
.conclusion .body {
  font-size: 9.5pt;
  line-height: 1.28;
  margin-top: 1mm;
}

.reco { margin-top: 2mm; }
.reco-title { font-weight: bold; font-size: 9pt; margin-bottom: 1.5mm; }
.reco-option { display: flex; align-items: center; font-size: 9pt; margin-bottom: 1.2mm; }
.reco-box {
  width: 4mm;
  height: 4mm;
  border: 0.25mm solid #000;
  margin-right: 3mm;
  text-align: center;
  font-weight: bold;
  font-size: 8.5pt;
  line-height: 3.6mm;
}
.reco-note { font-size: 8.5pt; margin-top: 2mm; }
.signature { margin-top: 3mm; }
.sig-row { display: flex; align-items: flex-end; font-size: 9pt; margin-bottom: 1mm; }
.sig-label { width: 62mm; }
.sig-sep { width: 4mm; }
.sig-value { flex: 1; border-bottom: 0.25mm dotted #666; min-height: 5mm; }
.sig-sign { min-height: 15mm; display: flex; align-items: flex-end; }
.sig-img { height: 13mm; margin-bottom: 1mm; }
`;

function renderHeader(assets: ReportAssets): string {
  return `<header class="doc-header">
  <img class="logo-klinik" src="${assets.klinikLogo}" alt="Klinik Yuliarpan Medika">
  <img class="logo-etp" src="${assets.etpLogo}" alt="PT Esa Tunggal Pratama">
</header>`;
}

function renderFooter(assets: ReportAssets): string {
  return `<footer class="doc-footer">
  <img class="logo-mypsikolog" src="${assets.mypsikologLogo}" alt="mypsikolog.id">
  <img class="tagline" src="${assets.tagline}" alt="Platform Tes Psikologi">
</footer>`;
}

function renderConclusion(snapshot: ReportSnapshot, key: string): string {
  return `<div class="conclusion">
  <div class="label">Kesimpulan</div>
  <div class="body">${narrative(snapshot, key)}</div>
</div>`;
}

function renderSection(
  section: RatingSection,
  snapshot: ReportSnapshot,
  narrativeKey: string,
): string {
  const rows = section.aspects
    .map((aspect, index) => {
      const cells = RATING_VALUES.map(
        (value) =>
          `<td class="cat">${snapshot.ratings[aspect.key] === value ? 'X' : ''}</td>`,
      ).join('');
      return `<tr>
      <td class="c-letter">${String.fromCharCode(65 + index)}</td>
      <td>${escapeHtml(aspect.label)}</td>
      <td>${escapeHtml(aspect.description)}</td>
      ${cells}
    </tr>`;
    })
    .join('\n');

  return `<section class="section">
  <div class="section-title">${escapeHtml(section.label)}</div>
  <table class="grid">
    <colgroup>
      <col style="width:8mm">
      <col style="width:34mm">
      <col>
      ${RATING_VALUES.map(() => '<col style="width:8mm">').join('')}
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2"></th>
        <th rowspan="2">ASPEK YANG<br>DINILAI</th>
        <th rowspan="2">URAIAN</th>
        <th colspan="5">KATEGORI</th>
      </tr>
      <tr>
        ${RATING_VALUES.map((value) => `<th class="c-cat">${value}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="legend">Keterangan= &nbsp; R: Rendah &nbsp;&nbsp; K: Kurang &nbsp;&nbsp; C: Cukup &nbsp;&nbsp; B: Baik &nbsp;&nbsp; T: Tinggi</div>
  ${renderConclusion(snapshot, narrativeKey)}
</section>`;
}

function sectionByIndex(index: number): RatingSection {
  return RATING_SECTIONS[index];
}

function renderCover(params: RenderReportParams): string {
  const { snapshot, number, assets } = params;
  const rows: [string, string][] = [
    ['Nama', dash(snapshot.holder.name)],
    [
      'Usia',
      snapshot.holder.age === null ? '-' : `${snapshot.holder.age} tahun`,
    ],
    ['Pendidikan', dash(snapshot.holder.education)],
    ['Tujuan', dash(snapshot.holder.destination)],
  ];

  return `<section class="page page-cover">
  ${renderHeader(assets)}
  <div class="rahasia">RAHASIA</div>
  <div class="cover-title">Laporan Hasil<br>Pemeriksaan Psikologi</div>
  <div class="cover-subtitle">Psychological Assessment Report CPMI</div>
  <div class="cover-number">Nomor laporan: ${escapeHtml(number)}</div>
  <table class="cover-identity">
    ${rows
      .map(
        ([label, value]) => `<tr>
      <td class="label">${label}</td>
      <td class="sep">:</td>
      <td class="line">${value}</td>
    </tr>`,
      )
      .join('\n')}
  </table>
  <div class="qr-block">
    <img src="${assets.qr}" alt="QR verifikasi">
    <span>Pindai untuk verifikasi</span>
  </div>
  ${renderFooter(assets)}
</section>`;
}

function renderResume(params: RenderReportParams): string {
  const { snapshot, assets } = params;
  return `<section class="page">
  ${renderHeader(assets)}
  <div class="resume-head">
    <h1>RINGKASAN</h1>
    <h2>HASIL PEMERIKSAAN PSIKOLOGI</h2>
    <p>(Resume of Psychological Assessment)</p>
  </div>
  <div class="psy-block">
    <h3>Identitas Psikolog</h3>
    <div class="en">Psychologist&rsquo;s Identity</div>
    <div class="psy-row">
      <span class="psy-label">Nama Psikolog<br><i>Psychologist&rsquo;s Name</i></span>
      <span class="psy-value">: ${escapeHtml(snapshot.assessor.fullName)}, ${escapeHtml(snapshot.assessor.degree)}</span>
    </div>
    <div class="psy-row">
      <span class="psy-label">Nama Fasyankes/Lembaga Layanan Psikologi<br><i>Clinic/Hospital</i></span>
      <span class="psy-value">: ${escapeHtml(snapshot.institution)}</span>
    </div>
    <div class="psy-row">
      <span class="psy-label">Tanggal Pemeriksaan<br><i>Date of Assessment</i></span>
      <span class="psy-value">: ${formatIndonesianDate(snapshot.examDate)}</span>
    </div>
  </div>
  ${renderSection(sectionByIndex(0), snapshot, 'conclusion.intellectual')}
  ${renderFooter(assets)}
</section>`;
}

function renderMiddle(params: RenderReportParams): string {
  const { snapshot, assets } = params;
  return `<section class="page">
  ${renderHeader(assets)}
  ${renderSection(sectionByIndex(1), snapshot, 'conclusion.attitude')}
  ${renderSection(sectionByIndex(2), snapshot, 'conclusion.personality')}
  ${renderFooter(assets)}
</section>`;
}

function renderRecommendation(snapshot: ReportSnapshot): string {
  const options: [string, string][] = [
    ['LAYAK', 'Layak'],
    ['BELUM_LAYAK', 'Belum Layak'],
    ['TIDAK_LAYAK', 'Tidak Layak'],
  ];
  return `<div class="reco">
  <div class="reco-title">Rekomendasi</div>
  ${options
    .map(
      ([value, label]) => `<div class="reco-option">
    <span class="reco-box">${snapshot.recommendation === value ? 'X' : ''}</span>
    <span>${label}</span>
  </div>`,
    )
    .join('\n')}
  <div class="reco-note">Keterangan:<br>Tanda &ldquo;X&rdquo; adalah potensi dari kandidat CPMI.</div>
</div>`;
}

function renderSignature(
  snapshot: ReportSnapshot,
  assets: ReportAssets,
): string {
  const sipp = snapshot.assessor.sippNumber
    ? `<div class="sig-row">
    <span class="sig-label">Nomor SIPP/SIPPK / Licence Number</span>
    <span class="sig-sep">:</span>
    <span class="sig-value">${escapeHtml(snapshot.assessor.sippNumber)}</span>
  </div>`
    : '';

  return `<div class="signature">
  <div class="sig-row">
    <span class="sig-label">Tanggal / Date</span>
    <span class="sig-sep">:</span>
    <span class="sig-value">${formatIndonesianDate(snapshot.examDate)}</span>
  </div>
  <div class="sig-row sig-sign">
    <span class="sig-label">Tanda Tangan / Signature</span>
    <span class="sig-sep">:</span>
    <span class="sig-value"><img class="sig-img" src="${assets.signature}" alt="Tanda tangan"></span>
  </div>
  <div class="sig-row">
    <span class="sig-label">Nama Psikolog / Psychologist Name</span>
    <span class="sig-sep">:</span>
    <span class="sig-value">${escapeHtml(snapshot.assessor.fullName)}, ${escapeHtml(snapshot.assessor.degree)}</span>
  </div>
  <div class="sig-row">
    <span class="sig-label">Nomor STR/SIK / Registration Number</span>
    <span class="sig-sep">:</span>
    <span class="sig-value">${escapeHtml(snapshot.assessor.licenseNumber)}</span>
  </div>
  ${sipp}
</div>`;
}

function renderFinal(params: RenderReportParams): string {
  const { snapshot, assets } = params;
  return `<section class="page">
  ${renderHeader(assets)}
  ${renderSection(sectionByIndex(3), snapshot, 'conclusion.learning')}
  <div class="section">
    <div class="conclusion">
      <div class="label">Saran Pengembangan</div>
      <div class="body">${narrative(snapshot, 'development')}</div>
    </div>
    <div class="conclusion">
      <div class="label">Kesimpulan Umum</div>
      <div class="body">${narrative(snapshot, 'overall')}</div>
    </div>
    ${renderRecommendation(snapshot)}
  </div>
  ${renderSignature(snapshot, assets)}
  ${renderFooter(assets)}
</section>`;
}

export function renderReportHtml(params: RenderReportParams): string {
  const title = escapeHtml(params.number);
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Laporan ${title}</title>
  <style>${CSS}</style>
</head>
<body>
${renderCover(params)}
${renderResume(params)}
${renderMiddle(params)}
${renderFinal(params)}
</body>
</html>`;
}
