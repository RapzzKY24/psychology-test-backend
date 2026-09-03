import { Controller, Get, Patch, Param, Query, Body } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryReviewsSchema } from '../dto/query-reviews.dto';
import type { QueryReviewsDto } from '../dto/query-reviews.dto';
import { UpdateNotesSchema } from '../dto/update-notes.dto';
import type { UpdateNotesDto } from '../dto/update-notes.dto';
import { ReviewsService } from '../service/reviews.service';
import type {
  PaginatedResponse,
  ApiResponse,
} from '../../../common/interfaces/api-response.interface';
import type {
  ReviewListItem,
  ReviewDetail,
} from '../repository/reviews.repository';
import type { TestResult } from '../../../generated/prisma/client';

@Controller('api/v1/psychologist/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @Roles(['PSYCHOLOGIST'])
  async listReviews(
    @Query(new ZodValidationPipe(QueryReviewsSchema)) query: QueryReviewsDto,
  ): Promise<PaginatedResponse<ReviewListItem>> {
    return this.reviewsService.listReviews(query);
  }

  @Get(':id')
  @Roles(['PSYCHOLOGIST'])
  async getDetail(@Param('id') id: string): Promise<ApiResponse<ReviewDetail>> {
    const data = await this.reviewsService.getDetail(id);
    return { data };
  }

  @Patch(':id/notes')
  @Roles(['PSYCHOLOGIST'])
  async updateNotes(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateNotesSchema)) dto: UpdateNotesDto,
  ): Promise<ApiResponse<TestResult>> {
    const data = await this.reviewsService.updateNotes(id, dto.notes);
    return { data };
  }
}
