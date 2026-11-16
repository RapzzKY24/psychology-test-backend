import { Inject, Injectable } from '@nestjs/common';
import { ME_OVERVIEW_REPOSITORY } from '../repository/me-overview.repository';
import type { MeOverviewRepository } from '../repository/me-overview.repository';
import type { MeOverviewDto } from '../dto/me-overview.dto';

/** The participant dashboard's first screen, scoped to the session user. */
@Injectable()
export class MeOverviewService {
  constructor(
    @Inject(ME_OVERVIEW_REPOSITORY)
    private readonly repo: MeOverviewRepository,
  ) {}

  get(userId: string): Promise<MeOverviewDto> {
    return this.repo.forUser(userId);
  }
}
