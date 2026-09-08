import { Injectable, Inject } from '@nestjs/common';
import { SESSIONS_REPOSITORY } from '../../sessions/repository/sessions.repository';
import type {
  SessionsRepository,
  SessionTestsSummary,
} from '../../sessions/repository/sessions.repository';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from '../repository/instansi-participants.repository';
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';
import { InstansiParticipantsService } from './instansi-participants.service';

export interface InstansiOverview {
  employees: number;
  sessions: number;
  attempts: SessionTestsSummary;
}

/**
 * Dashboard aggregates for the caller's institution only.
 */
@Injectable()
export class InstansiOverviewService {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepo: SessionsRepository,
    @Inject(INSTANSI_PARTICIPANTS_REPOSITORY)
    private readonly participantsRepo: InstansiParticipantsRepository,
    private readonly participantsService: InstansiParticipantsService,
  ) {}

  async getOverview(userId: string): Promise<InstansiOverview> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const [{ total: employees }, sessions, attempts] = await Promise.all([
      this.participantsRepo.findMany({ institutionId, skip: 0, take: 1 }),
      this.sessionsRepo.countSessionsByInstitution(institutionId),
      this.sessionsRepo.getAttemptStatsByInstitution(institutionId),
    ]);
    return { employees, sessions, attempts };
  }
}
