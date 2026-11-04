/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ConfigService } from '@nestjs/config';
import { ReportAssetError, ReportAssetsService } from '../pdf/report-assets';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('ReportAssetsService', () => {
  let uploadDir: string;
  let config: ConfigService;
  let service: ReportAssetsService;

  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-assets-'));
    const values: Record<string, string> = {
      'app.uploadDir': uploadDir,
      'app.publicUrl': 'https://mypsikolog.id',
    };
    config = {
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    } as unknown as ConfigService;
    service = new ReportAssetsService(config);
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  async function writeSignature(name = 'sig.png'): Promise<string> {
    const filepath = path.join(uploadDir, name);
    await fs.writeFile(filepath, PNG_1PX);
    return filepath;
  }

  it('returns every image as a data URI', async () => {
    const signaturePath = await writeSignature();

    const assets = await service.build({
      verifyCode: 'ABCD123456',
      signaturePath,
    });

    for (const key of [
      'klinikLogo',
      'etpLogo',
      'mypsikologLogo',
      'tagline',
      'signature',
      'qr',
    ] as const) {
      expect(assets[key]).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('embeds the signature file bytes', async () => {
    const signaturePath = await writeSignature();

    const assets = await service.build({
      verifyCode: 'ABCD123456',
      signaturePath,
    });

    expect(assets.signature).toContain(PNG_1PX.toString('base64'));
  });

  /**
   * A QR holding the bare code cannot be scanned from paper, so a deployment
   * without APP_PUBLIC_URL must refuse the document rather than print it.
   */
  it('refuses to draw a QR when APP_PUBLIC_URL is missing', async () => {
    const values: Record<string, string> = { 'app.uploadDir': uploadDir };
    const bare = {
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    } as unknown as ConfigService;
    const withoutUrl = new ReportAssetsService(bare);
    const signaturePath = await writeSignature();

    await expect(
      withoutUrl.build({ verifyCode: 'ABCD123456', signaturePath }),
    ).rejects.toMatchObject({ code: 'report_public_url_missing' });
  });

  it('jails the signature path to the upload directory', async () => {
    const outside = path.join(os.tmpdir(), 'elsewhere.png');
    await fs.writeFile(outside, PNG_1PX);

    await expect(
      service.build({ verifyCode: 'X', signaturePath: outside }),
    ).rejects.toBeInstanceOf(ReportAssetError);

    await fs.rm(outside, { force: true });
  });

  it('reports a missing signature file', async () => {
    const error = await service
      .build({
        verifyCode: 'X',
        signaturePath: path.join(uploadDir, 'nope.png'),
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ReportAssetError);
    expect((error as ReportAssetError).code).toBe('report_signature_missing');
  });

  it('reuses the cached static images across calls', async () => {
    const signaturePath = await writeSignature();

    await service.build({ verifyCode: 'A', signaturePath });
    const readSpy = jest.spyOn(fs, 'readFile');
    await service.build({ verifyCode: 'B', signaturePath });

    expect(readSpy).toHaveBeenCalledTimes(1);
    readSpy.mockRestore();
  });
});
