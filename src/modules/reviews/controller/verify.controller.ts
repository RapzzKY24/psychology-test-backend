import { Controller, Get, Ip, Param } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ReviewsService } from '../service/reviews.service';

@Controller('api/v1/public/verify')
export class VerifyController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':code')
  @AllowAnonymous()
  async verify(@Param('code') code: string, @Ip() ip: string) {
    const result = await this.reviewsService.verify(code, ip || 'unknown');
    return result;
  }
}
