import { renderCertificateHtml } from '../pdf/certificate-html';
import type { CertificateAssets } from '../pdf/certificate-html';
import type { CertificateView } from '../utils/certificate-snapshot';

const assets: CertificateAssets = {
  background: 'data:image/png;base64,AAAA',
  font: 'data:font/woff2;base64,BBBB',
  photo: 'data:image/png;base64,CCCC',
  signature: 'data:image/png;base64,DDDD',
  qr: 'data:image/png;base64,EEEE',
};

function view(overrides: Partial<CertificateView> = {}): CertificateView {
  return {
    holder: {
      fullName: 'Budi Santoso',
      idNumber: '3201010101960001',
      gender: 'LAKI_LAKI',
      birthPlace: 'Bandung',
      birthDate: '1996-01-01',
      age: 30,
      address: 'Jl. Merdeka No. 1',
    },
    test: { name: 'TES KRAEPELIN', slug: 'kraepelin' },
    verdict: 'MEMENUHI_SYARAT',
    purpose: 'CPMI',
    validUntil: '2027-11-03',
    issuer: {
      fullName: 'Faradila Ishara Lestari',
      degree: 'M.Psi, Psikolog',
      sippNumber: '20211226',
      signaturePath: 'signatures/a.png',
    },
    photoPath: 'uploads/certificates/p.png',
    number: '060/TES-KRAEPELIN/YM/XI/2026',
    city: 'Bandung',
    issuedOn: '2026-11-03',
    issuedAt: '2026-11-03T03:00:00.000Z',
    ...overrides,
  };
}

function render(overrides: Partial<CertificateView> = {}): string {
  return renderCertificateHtml({ snapshot: view(overrides), assets });
}

describe('renderCertificateHtml', () => {
  it('produces exactly one page', () => {
    expect(render().match(/class="page"/g)).toHaveLength(1);
  });

  it('prints the certificate number', () => {
    expect(render()).toContain('060/TES-KRAEPELIN/YM/XI/2026');
  });

  it('prints the test name next to the baked subtitle', () => {
    expect(render()).toContain('TES KRAEPELIN');
  });

  it('prints every identity row', () => {
    const html = render();
    expect(html).toContain('Budi Santoso');
    expect(html).toContain('3201010101960001');
    expect(html).toContain('Laki-laki');
    expect(html).toContain('Bandung, 1 Januari 1996');
    expect(html).toContain('30 tahun');
    expect(html).toContain('Jl. Merdeka No. 1');
  });

  it('spells the gender out instead of printing the enum', () => {
    const html = render({
      holder: { ...view().holder, gender: 'PEREMPUAN' },
    });
    expect(html).toContain('Perempuan');
    expect(html).not.toContain('PEREMPUAN');
  });

  it('prints the verdict sentence with the purpose in bold', () => {
    expect(render()).toContain('<b>MEMENUHI SYARAT</b> untuk <b>CPMI</b>.');
  });

  it('prints the negative verdict as words', () => {
    const html = render({ verdict: 'TIDAK_MEMENUHI_SYARAT' });
    expect(html).toContain('TIDAK MEMENUHI SYARAT');
    expect(html).not.toContain('TIDAK_MEMENUHI_SYARAT');
  });

  it('formats the validity date and the issue date in Indonesian', () => {
    const html = render();
    expect(html).toContain('3 November 2027');
    expect(html).toContain('Bandung, 3 November 2026');
  });

  it('prints the signer and the SIPP number', () => {
    const html = render();
    expect(html).toContain('Faradila Ishara Lestari');
    expect(html).toContain('20211226');
  });

  it('prints the name without the degree, which does not fit the box', () => {
    expect(render()).not.toContain('M.Psi, Psikolog');
  });

  it('omits the SIPP line when the psychologist has no number', () => {
    const html = render({
      issuer: { ...view().issuer, sippNumber: null },
    });
    expect(html).not.toContain('SIPP');
  });

  it('embeds the background, the font and the three images', () => {
    const html = render();
    expect(html).toContain(assets.background);
    expect(html).toContain(assets.font);
    expect(html).toContain(assets.photo);
    expect(html).toContain(assets.signature);
    expect(html).toContain(assets.qr);
  });

  /**
   * Regression: without `position: absolute` the three images were laid out
   * in-flow, painted *below* the absolutely positioned background, and the
   * page looked as if the photo, signature and QR had never been drawn.
   */
  it('positions the three images so the background cannot cover them', () => {
    const html = render();
    for (const cls of ['photo', 'signature', 'qr']) {
      const rule = html.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0] ?? '';
      expect(rule).toContain('position: absolute');
    }
  });

  it('declares the font as one variable face covering every weight', () => {
    const html = render();
    expect(html).toContain("font-family: 'Raleway'");
    expect(html).toContain('font-weight: 100 900');
  });

  it('uses the template page size in points', () => {
    expect(render()).toContain('size: 595.5pt 842.25pt');
  });

  describe('draft preview', () => {
    function draft(): string {
      return renderCertificateHtml({
        snapshot: view({ number: '' }),
        assets: { ...assets, qr: null },
        draft: true,
      });
    }

    it('omits the number', () => {
      const html = draft();
      expect(html).not.toContain('060/TES-KRAEPELIN');
    });

    it('adds the watermark', () => {
      expect(draft()).toContain('class="watermark">DRAF<');
    });

    it('marks the empty QR slot instead of leaving the area blank', () => {
      const html = draft();
      expect(html).not.toContain(assets.qr);
      expect(html).toContain('class="qr qr-placeholder"');
      expect(html).toContain('QR setelah terbit');
    });

    it('still prints the values that are already filled in', () => {
      expect(draft()).toContain('Budi Santoso');
      expect(draft()).toContain('<b>MEMENUHI SYARAT</b>');
    });
  });

  it('escapes HTML in every dynamic field', () => {
    const html = render({
      holder: {
        ...view().holder,
        fullName: '<script>alert(1)</script>',
        address: 'a & b',
      },
      purpose: '<img onerror=x>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('&lt;img onerror=x&gt;');
  });

  it('renders a draft with a missing photo and signature', () => {
    const html = renderCertificateHtml({
      snapshot: view({ photoPath: null }),
      assets: { ...assets, photo: null, signature: null },
      draft: true,
    });
    expect(html).not.toContain('class="photo"');
    expect(html).not.toContain('class="signature"');
    expect(html).toContain('class="page"');
  });
});
