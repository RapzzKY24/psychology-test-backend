import { Controller, Get, Param, Req } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ReviewsService } from '../service/reviews.service';
import type { Request } from 'express';

@Controller('api/v1/public/verify')
export class VerifyController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':code')
  @AllowAnonymous()
  async verify(@Param('code') code: string, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const result = await this.reviewsService.verify(code, ip);
    return result;
  }
}
