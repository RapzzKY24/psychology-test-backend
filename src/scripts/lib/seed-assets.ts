import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';

/**
 * Item figures are committed under `prisma/seed-data/assets/<slug>/` because
 * `uploads/` is gitignored. Copying them keeps a fresh VPS seed self-contained,
 * and the fixed uuids in the manifest keep `imageUrl` stable across re-seeds.
 */
export interface AssetManifest {
  items: { item: number; file: string; imageUrl: string }[];
}

export function readAssetManifest(assetDir: string): AssetManifest | null {
  const manifestPath = join(assetDir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as AssetManifest;
}

/** Copies every manifest figure into `$UPLOAD_DIR/test-items`; returns the count. */
export function installItemAssets(assetDir: string): number {
  const manifest = readAssetManifest(assetDir);
  if (!manifest) return 0;
  const uploadRoot = process.env.UPLOAD_DIR ?? './uploads';
  const targetDir = join(uploadRoot, 'test-items');
  mkdirSync(targetDir, { recursive: true });
  for (const entry of manifest.items) {
    copyFileSync(
      join(assetDir, entry.file),
      join(targetDir, basename(entry.imageUrl)),
    );
  }
  return manifest.items.length;
}
