import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import type { ReportAssets } from './report-html';

/** Directory holding the four static images extracted from the template PDF. */
const STATIC_DIR = './assets/report';

const STATIC_FILES = {
  klinikLogo: 'logo-klinik.png',
  etpLogo: 'logo-etp.png',
  mypsikologLogo: 'logo-mypsikolog.png',
  tagline: 'tagline.png',
} as const;

type StaticAssets = Omit<ReportAssets, 'signature' | 'qr'>;

/** Raised when the psychologist signature file is gone from disk. */
export class ReportAssetError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ReportAssetError';
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

@Injectable()
export class ReportAssetsService {
  private staticCache: Promise<StaticAssets> | null = null;

  constructor(private readonly config: ConfigService) {}

  async build(params: {
    verifyCode: string;
    signaturePath: string;
  }): Promise<ReportAssets> {
    const [statics, signature, qr] = await Promise.all([
      this.loadStatic(),
      this.loadSignature(params.signaturePath),
      this.buildQr(params.verifyCode),
    ]);
    return { ...statics, signature, qr };
  }

  /**
   * The four template images never change, so they are read once per process.
   * A failed read clears the cache instead of caching the rejection forever.
   */
  private loadStatic(): Promise<StaticAssets> {
    if (!this.staticCache) {
      this.staticCache = (async () => {
        const entries = await Promise.all(
          Object.entries(STATIC_FILES).map(async ([key, file]) => {
            const filepath = path.resolve(STATIC_DIR, file);
            const buffer = await fs.readFile(filepath);
            return [key, toDataUri(filepath, buffer)] as const;
          }),
        );
        return Object.fromEntries(entries) as unknown as StaticAssets;
      })().catch((error: unknown) => {
        this.staticCache = null;
        throw error;
      });
    }
    return this.staticCache;
  }

  /**
   * The stored path comes from the database, so it is jailed to the upload
   * directory before reading — same guard as the signature download endpoint.
   */
  private async loadSignature(stored: string): Promise<string> {
    const uploadDir = this.config.get<string>('app.uploadDir', './uploads');
    const base = `${path.resolve(uploadDir)}${path.sep}`;
    const full = path.resolve(stored);
    if (!full.startsWith(base)) {
      throw new ReportAssetError('report_signature_missing');
    }
    try {
      const buffer = await fs.readFile(full);
      return toDataUri(full, buffer);
    } catch {
      throw new ReportAssetError('report_signature_missing');
    }
  }

  private buildQr(verifyCode: string): Promise<string> {
    const publicUrl = (this.config.get<string>('app.publicUrl') ?? '').replace(
      /\/+$/,
      '',
    );
    const target = publicUrl
      ? `${publicUrl}/verifikasi-laporan/${verifyCode}`
      : verifyCode;
    return QRCode.toDataURL(target, { margin: 1, width: 400 });
  }
}
