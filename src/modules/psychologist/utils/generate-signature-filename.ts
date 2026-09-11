import { randomUUID } from 'crypto';

export function generateSignatureFilename(
  _originalName: string,
  mimetype: string,
): string {
  // Extension derives ONLY from the allow-listed mimetype — originalName is
  // fully client-controlled and must never influence the stored file type.
  // (validateImageFile runs first and rejects anything outside this list.)
  const ext = mimetype === 'image/png' ? '.png' : '.jpg';
  return `${randomUUID()}${ext}`;
}
