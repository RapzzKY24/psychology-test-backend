import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Express } from 'express';

const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB for item images (figural matrices)

export function validateItemImageFile(file: Express.Multer.File): void {
  if (!file) throw new BadRequestException('file is required');
  if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
    throw new UnsupportedMediaTypeException('unsupported_media_type');
  }
  if (file.size > MAX_SIZE) {
    throw new PayloadTooLargeException('file_too_large');
  }
}
