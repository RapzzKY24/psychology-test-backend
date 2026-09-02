import * as path from 'path';
import { randomUUID } from 'crypto';

export function generateSignatureFilename(
  originalName: string,
  mimetype: string,
): string {
  const ext =
    path.extname(originalName) || (mimetype === 'image/png' ? '.png' : '.jpg');
  return `${randomUUID()}${ext}`;
}
