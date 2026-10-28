import { Inject, Injectable } from '@nestjs/common';
import { INSTANSI_STATS_REPOSITORY } from '../repository/instansi-stats.repository';
import type { InstansiStatsRepository } from '../repository/instansi-stats.repository';
import type { InstansiSessionProgressStats } from '../dto/instansi-stats.dto';
import { summarizeSessionProgress } from '../utils/summarize-session-progress';
import { InstansiParticipantsService } from './instansi-participants.service';

@Injectable()
export class InstansiStatsService {
  constructor(
    @Inject(INSTANSI_STATS_REPOSITORY)
    private readonly repo: InstansiStatsRepository,
    private readonly participantsService: InstansiParticipantsService,
  ) {}

  async getProgress(
    userId: string,
    limit: number,
  ): Promise<InstansiSessionProgressStats> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const rows = await this.repo.findSessionProgress({ institutionId, limit });

    return {
      sessions: rows.map((row) => ({
        sessionId: row.id,
        title: row.title,
        status: row.status,
        slotLimit: row.slotLimit,
        ...summarizeSessionProgress(row.participants, row.slotLimit),
      })),
    };
  }
}
