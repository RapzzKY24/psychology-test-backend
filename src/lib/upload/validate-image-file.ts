import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Express } from 'express';

const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const DEFAULT_MAX_BYTES = 1024 * 1024;

/**
 * Gate for an uploaded image. Any filename written to disk must take its
 * extension from the mimetype, never from `originalname`: that string is fully
 * client-controlled and must not influence the stored file type.
 */
export function validateImageFile(
  file: Express.Multer.File,
  maxBytes: number = DEFAULT_MAX_BYTES,
): void {
  if (!file) throw new BadRequestException('file is required');
  if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
    throw new UnsupportedMediaTypeException('unsupported_media_type');
  }
  if (file.size > maxBytes) {
    throw new PayloadTooLargeException('file_too_large');
  }
}
