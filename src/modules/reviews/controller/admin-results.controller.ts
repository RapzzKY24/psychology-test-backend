import { Controller, Post, Param } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ReviewsService } from '../service/reviews.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';
import type { TestResult } from '../../../generated/prisma/client';

@Controller('api/v1/admin/results')
export class AdminResultsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(':id/resubmit')
  @Roles(['ADMIN'])
  async resubmit(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
  ): Promise<ApiResponse<TestResult>> {
    const data = await this.reviewsService.resubmit(id);
    return { data };
  }
}
