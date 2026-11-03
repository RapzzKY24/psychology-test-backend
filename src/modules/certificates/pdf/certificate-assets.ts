import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import type { CertificateAssets } from './certificate-html';

/** Directory holding the generated background and the webfont. */
const STATIC_DIR = './assets/certificate';

/** Raised when a file an issued certificate needs is gone from disk. */
export class CertificateAssetError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CertificateAssetError';
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function toDataUri(filepath: string, buffer: Buffer): string {
  const mime =
    MIME_BY_EXTENSION[path.extname(filepath).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

interface StaticAssets {
  background: string;
  font: string;
}

@Injectable()
export class CertificateAssetsService {
  private staticCache: Promise<StaticAssets> | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * `photoPath` and `signaturePath` are null while a draft is still being
   * filled in, so a missing image is only an error when the caller expected
   * one — that decision belongs to the document service, not here.
   */
  async build(params: {
    verifyCode: string | null;
    photoPath: string | null;
    signaturePath: string | null;
  }): Promise<CertificateAssets> {
    const [statics, photo, signature, qr] = await Promise.all([
      this.loadStatic(),
      this.loadImage(params.photoPath, 'certificate_photo_missing'),
      this.loadImage(params.signaturePath, 'certificate_signature_missing'),
      params.verifyCode ? this.buildQr(params.verifyCode) : null,
    ]);
    return { ...statics, photo, signature, qr };
  }

  /**
   * The background and the font never change, so they are read once per
   * process. A failed read clears the cache instead of caching the rejection
   * forever.
   */
  private loadStatic(): Promise<StaticAssets> {
    if (!this.staticCache) {
      this.staticCache = (async () => {
        const [background, font] = await Promise.all([
          fs.readFile(path.resolve(STATIC_DIR, 'template.png')),
          fs.readFile(path.resolve(STATIC_DIR, 'fonts', 'Raleway-latin.woff2')),
        ]);
        return {
          background: `data:image/png;base64,${background.toString('base64')}`,
          font: `data:font/woff2;base64,${font.toString('base64')}`,
        };
      })().catch((error: unknown) => {
        this.staticCache = null;
        throw error;
      });
    }
    return this.staticCache;
  }

  /**
   * Stored paths come from the database, so they are jailed to the upload
   * directory before reading — same guard as the signature download endpoint.
   */
  private async loadImage(
    stored: string | null,
    errorCode: string,
  ): Promise<string | null> {
    if (!stored) return null;
    const uploadDir = this.config.get<string>('app.uploadDir', './uploads');
    const base = `${path.resolve(uploadDir)}${path.sep}`;
    const full = path.resolve(stored);
    if (!full.startsWith(base)) {
      throw new CertificateAssetError(errorCode);
    }
    try {
      const buffer = await fs.readFile(full);
      return toDataUri(full, buffer);
    } catch {
      throw new CertificateAssetError(errorCode);
    }
  }

  /**
   * The QR must land on a page a stranger can read, so it carries the public
   * URL when one is configured and the bare code otherwise.
   */
  private buildQr(verifyCode: string): Promise<string> {
    const publicUrl = (this.config.get<string>('app.publicUrl') ?? '').replace(
      /\/+$/,
      '',
    );
    const target = publicUrl
      ? `${publicUrl}/verifikasi-sertifikat/${verifyCode}`
      : verifyCode;
    return QRCode.toDataURL(target, { margin: 1, width: 400 });
  }
}
