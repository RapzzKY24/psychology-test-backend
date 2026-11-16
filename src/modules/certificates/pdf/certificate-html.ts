import { formatIndonesianDate } from '../../reports/utils/format-indonesian-date';
import type { CertificateView } from '../utils/certificate-snapshot';
import {
  DECLARED_TO_PRINTED,
  IDENTITY,
  IMAGE,
  INK,
  PAGE,
  TEXT,
} from './certificate-layout';
import type { IdentityKey, TextSlot } from './certificate-layout';

/**
 * Data URIs — the renderer never touches the filesystem. A missing photo or
 * signature is null rather than an empty string so the tag can be dropped
 * instead of printing a broken image icon.
 */
export interface CertificateAssets {
  /** `template.png`, the whole page background. */
  background: string;
  /** Raleway as one variable woff2, weight axis 100-900. */
  font: string;
  photo: string | null;
  signature: string | null;
  /** Null only for a draft, which has no verify code yet. */
  qr: string | null;
}

export interface RenderCertificateParams {
  snapshot: CertificateView;
  assets: CertificateAssets;
  /**
   * Preview of a draft: no number and a diagonal watermark. Everything else
   * prints as it will once the certificate is issued.
   */
  draft?: boolean;
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

function printed(size: number): number {
  return size * DECLARED_TO_PRINTED;
}

/**
 * The slot `top` values are ascender tops: that is what `pdftohtml` reports
 * for a text box. CSS positions a line box, whose baseline sits 0.853 em below
 * its top once `line-height` is 1, and Raleway's cap top is a further 0.710 em
 * up from the baseline. Ascender top -> cap top is 0.940 - 0.710 = 0.230 em and
 * cap top -> line box top is -0.143 em, so the metrics alone give 0.087 em.
 *
 * Measured against a 150 dpi render of this page, every run landed ~0.35 pt
 * high at 12.6 pt, so the constant carries that correction too (0.087 + 0.028).
 * The check is the ink-band comparison recorded in the plan, not a unit test:
 * a headless browser is too slow and too machine-dependent for the unit suite.
 */
const ASCENDER_TO_LINE_BOX = 0.115;

function slotStyle(slot: TextSlot): string {
  const size = printed(slot.size);
  const top = slot.top + ASCENDER_TO_LINE_BOX * size;
  return [
    `left:${slot.x}pt`,
    `top:${top.toFixed(2)}pt`,
    `width:${slot.maxWidth}pt`,
    `font-size:${size.toFixed(2)}pt`,
    `font-weight:${slot.weight}`,
    `text-align:${slot.align}`,
  ].join(';');
}

function imageStyle(slot: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  return [
    `left:${slot.x}pt`,
    `top:${slot.y}pt`,
    `width:${slot.width}pt`,
    `height:${slot.height}pt`,
  ].join(';');
}

const VERDICT_LABELS = {
  MEMENUHI_SYARAT: 'MEMENUHI SYARAT',
  TIDAK_MEMENUHI_SYARAT: 'TIDAK MEMENUHI SYARAT',
} as const;

const GENDER_LABELS: Record<string, string> = {
  LAKI_LAKI: 'Laki-laki',
  PEREMPUAN: 'Perempuan',
};

function identityValue(key: IdentityKey, snapshot: CertificateView): string {
  const holder = snapshot.holder;
  switch (key) {
    case 'fullName':
      return holder.fullName;
    case 'idNumber':
      return holder.idNumber;
    case 'gender':
      return GENDER_LABELS[holder.gender] ?? holder.gender;
    case 'birthPlaceDate': {
      const place = holder.birthPlace?.trim();
      const date = holder.birthDate
        ? formatIndonesianDate(holder.birthDate)
        : '';
      return [place, date].filter(Boolean).join(', ');
    }
    case 'age':
      return holder.age > 0 ? `${holder.age} tahun` : '';
    case 'address':
      return holder.address;
  }
}

const CSS = `
@page { size: ${PAGE.width}pt ${PAGE.height}pt; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Raleway', sans-serif;
  color: ${INK};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  position: relative;
  width: ${PAGE.width}pt;
  height: ${PAGE.height}pt;
  overflow: hidden;
}
.background {
  position: absolute;
  left: 0;
  top: 0;
  width: ${PAGE.width}pt;
  height: ${PAGE.height}pt;
}
.slot {
  position: absolute;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
}
/* Only the address and the purpose may run long; every other row has a baked
   neighbour directly underneath and must stay on one line. */
.slot.wrap {
  white-space: normal;
  line-height: 1.15;
}
/* These three carry left/top from the layout, so they must be positioned: an
   in-flow image paints *below* the absolutely positioned background and is
   covered by it — the page looks as if the photo, signature and QR were never
   rendered at all. */
.photo {
  position: absolute;
  object-fit: cover;
  object-position: center top;
}
/* The signature band is 78.7 pt tall and the name starts immediately below
   it, so the scan is scaled to fit rather than drawn at its natural size. */
.signature {
  position: absolute;
  object-fit: contain;
  object-position: center;
}
.qr {
  position: absolute;
  object-fit: contain;
  /* Crisp modules if the QR is a raster; no effect on an SVG data URI. */
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
/* A draft has no verify code yet, so this slot would print as empty paper and
   read as a missing element. A dashed frame names what will be there. */
.qr-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 0.75pt dashed ${INK};
  text-align: center;
  font-size: 5.5pt;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.2pt;
  color: ${INK};
  opacity: 0.65;
}
.watermark {
  position: absolute;
  left: 0;
  top: 0;
  width: ${PAGE.width}pt;
  height: ${PAGE.height}pt;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-30deg);
  /* 64 pt keeps "DRAF" inside the page once rotated; anything larger runs off
     both edges and reads as a printing fault rather than a watermark. The
     opacity has to survive the template's gradient — at 0.1 the last letter
     vanished over the light band — while staying lighter than any value
     printed on the page. */
  font-size: 64pt;
  font-weight: 800;
  letter-spacing: 6pt;
  color: ${INK};
  opacity: 0.25;
}
`;

/**
 * Every text slot is a fixed box with `overflow: hidden`, so a value longer
 * than its box used to be cut off silently ("Muhammad Rizky Aulia Pu"). This
 * shrinks the font in 0.25 px steps, down to 72 % of its size, until the text
 * fits its width (one-line slots) or its max-height (wrapping slots). It runs
 * after the font is ready so it measures Raleway, not the fallback. When
 * printing with Puppeteer, wait for `document.fonts.ready` (or
 * `networkidle0`) before `page.pdf()`.
 */
const FIT_SCRIPT = `
(function () {
  function fit() {
    document.querySelectorAll('.slot').forEach(function (el) {
      var size = parseFloat(getComputedStyle(el).fontSize);
      var min = size * 0.72;
      var wrap = el.classList.contains('wrap');
      var guard = 0;
      while (
        guard++ < 60 && size > min &&
        (wrap ? el.scrollHeight > el.clientHeight + 0.5
              : el.scrollWidth > el.clientWidth + 0.5)
      ) {
        size -= 0.25;
        el.style.fontSize = size + 'px';
      }
    });
  }
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(fit);
})();
`;

function renderIdentity(snapshot: CertificateView): string {
  return IDENTITY.rows
    .map((row) => {
      const value = identityValue(row.key, snapshot);
      const size = printed(IDENTITY.size);
      const top = row.top + ASCENDER_TO_LINE_BOX * size;
      // The colon belongs to the label, so it prints even when the value is
      // empty (a draft); it sits on the label's own `top`.
      const colonStyle = [
        `left:${IDENTITY.colon.x}pt`,
        `top:${top.toFixed(2)}pt`,
        `width:${IDENTITY.colon.width}pt`,
        `font-size:${size.toFixed(2)}pt`,
        `font-weight:${IDENTITY.weight}`,
        'text-align:center',
      ].join(';');
      const colon = `  <div class="slot" style="${colonStyle}">:</div>`;
      if (!value) return colon;
      const style = [
        `left:${IDENTITY.valueX}pt`,
        `top:${top.toFixed(2)}pt`,
        `width:${IDENTITY.valueWidth}pt`,
        `font-size:${size.toFixed(2)}pt`,
        `font-weight:${IDENTITY.weight}`,
        ...(row.key === 'address'
          ? [`max-height:${IDENTITY.addressMaxHeight}pt`]
          : []),
      ].join(';');
      const className = row.key === 'address' ? 'slot wrap' : 'slot';
      return `${colon}\n  <div class="${className}" style="${style}">${escapeHtml(value)}</div>`;
    })
    .join('\n');
}

/**
 * The template prints this line with two weights: the verdict and the purpose
 * are Bold, the word "untuk" between them is Regular. A draft may still be
 * missing one of the two, so each half is rendered only when it exists.
 */
function renderVerdict(snapshot: CertificateView): string {
  const verdict = snapshot.verdict
    ? `<b>${escapeHtml(VERDICT_LABELS[snapshot.verdict])}</b>`
    : '';
  const purpose = snapshot.purpose.trim()
    ? `untuk <b>${escapeHtml(snapshot.purpose.trim())}</b>`
    : '';
  const sentence = [verdict, purpose].filter(Boolean).join(' ');
  if (!sentence) return '';
  // Two lines at most: a third would run into the baked validity sentence
  // 32 pt below, so the fit script shrinks the font instead.
  return `  <div class="slot wrap" style="${slotStyle(TEXT.verdict)};max-height:30pt">${sentence}.</div>`;
}

export function renderCertificateHtml(params: RenderCertificateParams): string {
  const { snapshot, assets, draft = false } = params;

  const number =
    draft || !snapshot.number
      ? ''
      : `  <div class="slot" style="${slotStyle(TEXT.number)}">${escapeHtml(snapshot.number)}</div>`;

  const photo = assets.photo
    ? `  <img class="photo" style="${imageStyle(IMAGE.photo)}" src="${assets.photo}" alt="Foto peserta">`
    : '';
  const signature = assets.signature
    ? `  <img class="signature" style="${imageStyle(IMAGE.signature)}" src="${assets.signature}" alt="Tanda tangan psikolog">`
    : '';
  const qr = assets.qr
    ? `  <img class="qr" style="${imageStyle(IMAGE.qr)}" src="${assets.qr}" alt="QR validasi">`
    : draft
      ? `  <div class="qr qr-placeholder" style="${imageStyle(IMAGE.qr)}">QR setelah terbit</div>`
      : '';

  const validUntil = snapshot.validUntil
    ? `  <div class="slot" style="${slotStyle(TEXT.validUntil)}">${escapeHtml(formatIndonesianDate(snapshot.validUntil))}</div>`
    : '';

  /**
   * The template leaves one 160 pt line under the signature band, and
   * "Faradila Ishara Lestari, M.Psi, Psikolog" needs twice that. The baked
   * `Psikolog` label above already carries the title, so the name prints
   * alone — the degree is on the report, which has room for it.
   */
  const signerName = snapshot.issuer.fullName;

  const cityDateText = [
    snapshot.city,
    snapshot.issuedOn ? formatIndonesianDate(snapshot.issuedOn) : '',
  ]
    .filter(Boolean)
    .join(', ');
  const cityDate = `  <div class="slot" style="${slotStyle(TEXT.cityDate)}">${escapeHtml(cityDateText)}</div>`;

  // The `SIPP NO` label is baked into the template, so it prints whether or
  // not the issuer has a number. A dash keeps it from dangling with nothing
  // after it.
  const sipp = `  <div class="slot" style="${slotStyle(TEXT.sippNumber)}">${escapeHtml(snapshot.issuer.sippNumber?.trim() || '-')}</div>`;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Sertifikat ${escapeHtml(snapshot.number || 'draf')}</title>
  <style>
@font-face {
  font-family: 'Raleway';
  src: url(${assets.font}) format('woff2');
  font-weight: 100 900;
  font-style: normal;
}
${CSS}
  </style>
</head>
<body>
<div class="page">
  <img class="background" src="${assets.background}" alt="">
${draft ? '  <div class="watermark">DRAF</div>' : ''}
  <div class="slot" style="${slotStyle(TEXT.testName)}">${escapeHtml(snapshot.test.name)}</div>
${number}
${renderIdentity(snapshot)}
${renderVerdict(snapshot)}
${validUntil}
${cityDate}
  <div class="slot" style="${slotStyle(TEXT.psychologistName)}">${escapeHtml(signerName)}</div>
${sipp}
${qr}
${photo}
${signature}
</div>
<script>${FIT_SCRIPT}</script>
</body>
</html>`;
}
