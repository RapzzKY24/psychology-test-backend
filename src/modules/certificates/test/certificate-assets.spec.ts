import type { ConfigService } from '@nestjs/config';
import { CertificateAssetsService } from '../pdf/certificate-assets';

function serviceWith(publicUrl: string): CertificateAssetsService {
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'app.publicUrl' ? publicUrl : fallback,
    ),
  } as unknown as ConfigService;
  return new CertificateAssetsService(config);
}

describe('CertificateAssetsService', () => {
  /**
   * A QR holding the bare code cannot be scanned from paper, so a deployment
   * without APP_PUBLIC_URL must refuse the document rather than print it.
   */
  it('refuses to draw a QR when APP_PUBLIC_URL is missing', async () => {
    await expect(
      serviceWith('').build({
        verifyCode: 'ABCD123456',
        photoPath: null,
        signaturePath: null,
      }),
    ).rejects.toMatchObject({ code: 'certificate_public_url_missing' });
  });

  it('draws a QR when the public URL is configured', async () => {
    const assets = await serviceWith('https://psikologitest.id').build({
      verifyCode: 'ABCD123456',
      photoPath: null,
      signaturePath: null,
    });

    expect(assets.qr).toMatch(/^data:image\/png;base64,/);
  });
});
