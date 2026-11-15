import path from 'path';

/** Where participant drawings live under the configured upload root. */
export const ATTEMPT_IMAGE_SUBDIR = 'attempt-images';

/**
 * One directory per attempt. The name is the attempt id, so a drawing can only
 * ever be found under the attempt it belongs to — no client-supplied filename
 * reaches the path.
 */
export function attemptImageDir(root: string, attemptId: string): string {
  return path.join(root, ATTEMPT_IMAGE_SUBDIR, attemptId);
}

/**
 * The drawing of one item. Always `.png`: the runner draws on a canvas and
 * exports PNG, so there is no extension to guess when serving it back.
 */
export function attemptImageFile(
  root: string,
  attemptId: string,
  itemId: string,
): string {
  return path.join(attemptImageDir(root, attemptId), `${itemId}.png`);
}
