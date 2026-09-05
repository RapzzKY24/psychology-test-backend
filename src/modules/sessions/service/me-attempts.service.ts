import { Inject, Injectable } from '@nestjs/common';
import { ATTEMPTS_REPOSITORY } from '../repository/attempts.repository';
import type { AttemptsRepository } from '../repository/attempts.repository';
import type { MeAttemptListItemDto } from '../dto/me-attempt.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/**
 * Participant attempts dashboard: the caller's own attempts in any status.
 * Session-authenticated only — guest attempts (participantId-owned) have no
 * dashboard and can never appear here (userId-only filter).
 */
@Injectable()
export class MeAttemptsService {
  constructor(
    @Inject(ATTEMPTS_REPOSITORY)
    private readonly repo: AttemptsRepository,
  ) {}

  /** Caller's own attempts, newest first (startedAt desc). */
  async list(
    userId: string,
    query: PaginationDto,
  ): Promise<PaginatedResponse<MeAttemptListItemDto>> {
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.listByUser({
      userId,
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
}
