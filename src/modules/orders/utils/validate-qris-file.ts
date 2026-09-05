import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Express } from 'express';

const ALLOWED = ['image/png', 'image/jpeg'];
const MAX = 2 * 1024 * 1024;

export function validateQrisFile(file: Express.Multer.File): void {
  if (!file) throw new BadRequestException('file_required');
  if (!ALLOWED.includes(file.mimetype)) {
    throw new UnsupportedMediaTypeException('unsupported_media_type');
  }
  if (file.size > MAX) {
    throw new PayloadTooLargeException('file_too_large');
  }
}
