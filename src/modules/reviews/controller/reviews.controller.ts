import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryReviewsSchema } from '../dto/query-reviews.dto';
import type { QueryReviewsDto } from '../dto/query-reviews.dto';
import { UpdateNotesSchema } from '../dto/update-notes.dto';
import type { UpdateNotesDto } from '../dto/update-notes.dto';
import { ReturnReviewSchema } from '../dto/return-review.dto';
import type { ReturnReviewDto } from '../dto/return-review.dto';
import { CorrectionSchema } from '../dto/correction.dto';
import type { CorrectionDto } from '../dto/correction.dto';
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
  async getDetail(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
  ): Promise<ApiResponse<ReviewDetail>> {
    const data = await this.reviewsService.getDetail(id);
    return { data };
  }

  @Patch(':id/notes')
  @Roles(['PSYCHOLOGIST'])
  async updateNotes(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
    @Body(new ZodValidationPipe(UpdateNotesSchema)) dto: UpdateNotesDto,
  ): Promise<ApiResponse<TestResult>> {
    const data = await this.reviewsService.updateNotes(id, dto.notes);
    return { data };
  }

  @Post(':id/approve')
  @Roles(['PSYCHOLOGIST'])
  async approve(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
    @Session() session: UserSession,
  ): Promise<ApiResponse<TestResult>> {
    const data = await this.reviewsService.approve(id, session.user.id);
    return { data };
  }

  @Post(':id/return')
  @Roles(['PSYCHOLOGIST'])
  async returnForReason(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
    @Body(new ZodValidationPipe(ReturnReviewSchema)) dto: ReturnReviewDto,
  ): Promise<ApiResponse<TestResult>> {
    const data = await this.reviewsService.returnForReason(id, dto.reason);
    return { data };
  }

  @Patch(':id/scores')
  @Roles(['PSYCHOLOGIST'])
  async applyCorrection(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
    @Body(new ZodValidationPipe(CorrectionSchema)) dto: CorrectionDto,
    @Session() session: UserSession,
  ): Promise<ApiResponse<TestResult>> {
    const data = await this.reviewsService.applyCorrection(
      id,
      dto,
      session.user.id,
    );
    return { data };
  }
}
