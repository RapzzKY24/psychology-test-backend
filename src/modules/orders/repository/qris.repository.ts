import type { Setting } from '../../../generated/prisma/client';

export const QRIS_REPOSITORY = 'QrisRepository';

export interface QrisRepository {
  /** Raw stored path of the QRIS image from Setting('payment.qrisImagePath'), or null. */
  findQrisStoredPath(): Promise<string | null>;
  /** Upsert Setting('payment.qrisImagePath') with the given relative path. */
  saveQrisStoredPath(path: string): Promise<void>;
}

export type QrisSetting = Setting;
