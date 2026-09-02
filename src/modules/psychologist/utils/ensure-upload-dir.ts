import * as fs from 'fs';

export async function ensureUploadDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}
