import { Controller, Post, Param } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ReviewsService } from '../service/reviews.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';
import type { TestResult } from '../../../generated/prisma/client';

@Controller('api/v1/admin/results')
export class AdminResultsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(':id/resubmit')
  @Roles(['ADMIN'])
  async resubmit(@Param('id') id: string): Promise<ApiResponse<TestResult>> {
    const data = await this.reviewsService.resubmit(id);
    return { data };
  }
}
