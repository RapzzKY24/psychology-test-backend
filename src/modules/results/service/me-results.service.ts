import { Injectable, Inject } from '@nestjs/common';
import { RESULTS_REPOSITORY } from '../repository/results.repository';
import type { ResultsRepository } from '../repository/results.repository';
import { ResultsService } from './results.service';
import { toMeResultListItemDto } from '../mappers/me-result.mapper';
import type { MeResultListItemDto } from '../dto/me-result.dto';
import type { MeResultViewDto } from '../dto/me-result.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/**
 * Participant results dashboard (feature 08 §API contract — dashboard slice).
 * Session-authenticated only: guests have no dashboard.
 */
@Injectable()
export class MeResultsService {
  constructor(
    @Inject(RESULTS_REPOSITORY)
    private readonly repo: ResultsRepository,
    private readonly resultsService: ResultsService,
  ) {}

  /** Caller's own attempts that have an APPROVED result, newest approval first. */
  async list(
    userId: string,
    query: PaginationDto,
  ): Promise<PaginatedResponse<MeResultListItemDto>> {
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.listApprovedByUser({
      userId,
      skip,
      take: query.limit,
    });
    return {
      data: data.map(toMeResultListItemDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Owner-only web view — same rules as the feature 05 public result:
   * not-owner / unknown attempt / not completed → 404 (anti-leak),
   * not APPROVED → 403 `result_not_released`.
   */
  async getOwnResult(
    userId: string,
    attemptId: string,
  ): Promise<MeResultViewDto> {
    return this.resultsService.getPublicResult(attemptId, { userId });
  }
}
