import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { REVIEWS_REPOSITORY } from '../repository/reviews.repository';
import type { ReviewsRepository } from '../repository/reviews.repository';
import type { QueryReviewsDto } from '../dto/query-reviews.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type {
  ReviewListItem,
  ReviewDetail,
} from '../repository/reviews.repository';
import type { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(REVIEWS_REPOSITORY)
    private readonly repo: ReviewsRepository,
  ) {}

  async listReviews(
    query: QueryReviewsDto,
  ): Promise<PaginatedResponse<ReviewListItem>> {
    const where: Prisma.TestResultWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.sessionId) where.attempt = { sessionId: query.sessionId };
    if (query.testId) {
      where.attempt = {
        ...(where.attempt as object),
        testId: query.testId,
      };
    }
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.listReviews({
      where,
      skip,
      take: query.limit,
    });
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getDetail(resultId: string): Promise<ReviewDetail> {
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    return detail;
  }

  async updateNotes(resultId: string, notes: string) {
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    return this.repo.updateNotes(resultId, notes);
  }
}
