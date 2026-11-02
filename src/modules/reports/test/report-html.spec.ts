import { renderReportHtml } from '../pdf/report-html';
import type { ReportAssets } from '../pdf/report-html';
import type { ReportSnapshot } from '../utils/report-snapshot';
import { NARRATIVE_KEYS, RATING_KEYS, RATING_SECTIONS } from '../rubric';

const assets: ReportAssets = {
  klinikLogo: 'data:image/png;base64,AAAA',
  etpLogo: 'data:image/png;base64,BBBB',
  mypsikologLogo: 'data:image/png;base64,CCCC',
  tagline: 'data:image/png;base64,DDDD',
  signature: 'data:image/png;base64,EEEE',
  qr: 'data:image/png;base64,FFFF',
};

function snapshot(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    holder: {
      name: 'Budi Santoso',
      age: 27,
      education: 'SMA/SMK',
      destination: 'Taiwan',
    },
    session: { id: 's1', title: 'Psikotes Batch November' },
    tests: [
      { name: 'DISC', patternCode: 'I' },
      { name: 'IST', patternCode: 'C' },
    ],
    assessor: {
      fullName: 'Faradila Ishara Lestari',
      degree: 'M.Psi, Psikolog',
      licenseNumber: '25022211674',
      sippNumber: '20211226',
      signaturePath: 'signatures/a.png',
    },
    institution: 'YULIARPAN MEDIKA/ETP',
    ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, 'B'])),
    narratives: Object.fromEntries(
      NARRATIVE_KEYS.map((k) => [k, 'Kesimpulan untuk ' + k + '.']),
    ),
    recommendation: 'LAYAK',
    examDate: '2026-01-11',
    issuedAt: '2026-11-02T03:15:00.000Z',
    ...overrides,
  };
}

function render(overrides: Partial<ReportSnapshot> = {}): string {
  return renderReportHtml({
    snapshot: snapshot(overrides),
    number: '050/PSIKOTES/YM/XI/2026',
    assets,
  });
}

describe('renderReportHtml', () => {
  it('produces exactly four A4 pages', () => {
    const html = render();
    expect(html.match(/class="page/g)).toHaveLength(4);
  });

  it('prints the report number on the cover', () => {
    expect(render()).toContain('050/PSIKOTES/YM/XI/2026');
  });

  it('marks the cover as confidential', () => {
    expect(render()).toContain('RAHASIA');
  });

  it('prints the holder identity', () => {
    const html = render();
    expect(html).toContain('Budi Santoso');
    expect(html).toContain('27 tahun');
    expect(html).toContain('SMA/SMK');
    expect(html).toContain('Taiwan');
  });

  it('prints a dash for missing identity values', () => {
    const html = render({
      holder: { name: 'Budi', age: null, education: null, destination: null },
    });
    expect(html).toContain('>-<');
    expect(html).not.toContain('null tahun');
  });

  it('prints the assessor and institution', () => {
    const html = render();
    expect(html).toContain('Faradila Ishara Lestari');
    expect(html).toContain('M.Psi, Psikolog');
    expect(html).toContain('25022211674');
    expect(html).toContain('YULIARPAN MEDIKA/ETP');
  });

  it('formats dates in Indonesian', () => {
    expect(render()).toContain('11 Januari 2026');
  });

  it('prints all four section titles and 13 aspects', () => {
    const html = render();
    for (const section of RATING_SECTIONS) {
      expect(html).toContain(section.label);
      for (const aspect of section.aspects) {
        expect(html).toContain(aspect.label);
        expect(html).toContain(aspect.description);
      }
    }
  });

  it('marks exactly the 13 chosen ratings plus the recommendation', () => {
    const html = render();
    // 13 rating cells + 1 recommendation box
    expect(html.match(/>X</g)).toHaveLength(14);
  });

  it('marks nothing when no rating is set', () => {
    const html = render({ ratings: {} });
    expect(html.match(/>X</g)).toHaveLength(1);
  });

  it('marks only the chosen recommendation', () => {
    const html = render({ recommendation: 'TIDAK_LAYAK' });
    const reco = html.slice(html.indexOf('class="reco"'));
    expect(reco).toContain('>X<');
    expect(reco.indexOf('Tidak Layak')).toBeGreaterThan(-1);
  });

  it('prints the SIPP line when present', () => {
    expect(render()).toContain('Nomor SIPP/SIPPK');
  });

  it('omits the SIPP line when null', () => {
    const html = render({
      assessor: { ...snapshot().assessor, sippNumber: null },
    });
    expect(html).not.toContain('Nomor SIPP/SIPPK');
  });

  it('prints every narrative', () => {
    const html = render();
    for (const key of NARRATIVE_KEYS) {
      expect(html).toContain('Kesimpulan untuk ' + key + '.');
    }
  });

  it('converts newlines in a narrative to line breaks', () => {
    const html = render({
      narratives: {
        ...snapshot().narratives,
        overall: 'Baris satu.\nBaris dua.',
      },
    });
    expect(html).toContain('Baris satu.<br>Baris dua.');
  });

  it('escapes HTML in dynamic text', () => {
    const html = render({
      holder: {
        name: '<script>alert(1)</script>',
        age: 20,
        education: null,
        destination: null,
      },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('embeds the signature and QR images', () => {
    const html = render();
    expect(html).toContain(assets.signature);
    expect(html).toContain(assets.qr);
  });

  it('prints the QR on the last page, under the signature block', () => {
    const html = render();
    const pages = html.split('</section>');
    const cover = pages[0];
    const last = pages[pages.length - 2];

    // A reader checks authenticity where the credentials are, not on the cover.
    expect(cover).not.toContain(assets.qr);
    expect(last).toContain('class="verify-block"');
    expect(last).toContain(assets.qr);
    expect(last).toContain('Pindai untuk verifikasi');
    expect(last).toContain(assets.mypsikologLogo);
  });

  it('uses A4 page sizing and print colour', () => {
    const html = render();
    expect(html).toContain('size: A4');
    expect(html).toContain('print-color-adjust: exact');
    expect(html).toContain('#E6A0DC');
  });
});
