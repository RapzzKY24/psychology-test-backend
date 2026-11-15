import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Express } from 'express';

/**
 * PNG only. A drawing comes from the canvas in the runner, which exports PNG —
 * accepting JPEG as well would mean guessing the stored extension and serving
 * a file under the wrong content type.
 */
const ALLOWED_MIMETYPE = 'image/png';
/** Line art on a ~700 px canvas is tens of KB; 2 MB is already generous. */
const MAX_SIZE = 2 * 1024 * 1024;

export function validateAttemptImage(file: Express.Multer.File): void {
  if (!file) throw new BadRequestException('file is required');
  if (file.mimetype !== ALLOWED_MIMETYPE) {
    throw new UnsupportedMediaTypeException('unsupported_media_type');
  }
  if (file.size > MAX_SIZE) {
    throw new PayloadTooLargeException('file_too_large');
  }
  // A file that declares image/png but is empty would be stored as a broken
  // drawing and only fail when the psychologist opens the review.
  if (file.size === 0) throw new BadRequestException('file is empty');
}
