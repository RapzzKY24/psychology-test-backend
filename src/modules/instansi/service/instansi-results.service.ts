import { Injectable, Inject } from '@nestjs/common';
import { RESULTS_REPOSITORY } from '../../results/repository/results.repository';
import type { ResultsRepository } from '../../results/repository/results.repository';
import { InstansiParticipantsService } from './instansi-participants.service';
import {
  toInstansiResultItem,
  type InstansiResultItemDto,
} from '../dto/instansi-result.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/** Institution-scoped approved results — scoping derived from the caller. */
@Injectable()
export class InstansiResultsService {
  constructor(
    @Inject(RESULTS_REPOSITORY)
    private readonly repo: ResultsRepository,
    private readonly participantsService: InstansiParticipantsService,
  ) {}

  async list(
    userId: string,
    query: PaginationDto,
  ): Promise<PaginatedResponse<InstansiResultItemDto>> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.listApprovedByInstitution({
      institutionId,
      skip,
      take: query.limit,
    });
    return {
      data: data.map(toInstansiResultItem),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
