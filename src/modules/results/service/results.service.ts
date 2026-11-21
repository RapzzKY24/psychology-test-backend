import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { RESULTS_REPOSITORY } from '../repository/results.repository';
import type { ResultsRepository } from '../repository/results.repository';
import type { QueryResultsDto } from '../dto/query-results.dto';
import type { AdminResultListItemDto } from '../dto/admin-result-list-item.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type { TestResult } from '../../../generated/prisma/client';
import type { Prisma } from '../../../generated/prisma/client';
import { SESSIONS_REPOSITORY } from '../../sessions/repository/sessions.repository';
import type { SessionsRepository } from '../../sessions/repository/sessions.repository';
import { hashParticipantToken } from '../../sessions/utils/hash-participant-token';
import { getScorer } from '../../../scorers/registry';

@Injectable()
export class ResultsService {
  constructor(
    @Inject(RESULTS_REPOSITORY)
    private readonly repo: ResultsRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepo: SessionsRepository,
  ) {}

  // Public: owner only, 403 until APPROVED
  async getPublicResult(
    attemptId: string,
    owner: { userId?: string; participantToken?: string },
  ): Promise<{
    patternCode: string;
    scorerType: string;
    scores: unknown;
    interpretation: { title: string; body: string } | null;
    completedAt: Date | null;
  }> {
    const detail = await this.repo.findAttemptWithResult(attemptId);
    if (!detail || !detail.result)
      throw new NotFoundException('Result not found');

    // Ownership check — participantToken is raw header, must be hashed and resolved
    let participantId: string | null = null;
    if (owner.participantToken) {
      const hash = hashParticipantToken(owner.participantToken);
      const participant =
        await this.sessionsRepo.findParticipantByTokenHash(hash);
      participantId = participant?.id ?? null;
    }
    const isOwner =
      (owner.userId && detail.attempt.userId === owner.userId) ||
      (participantId && detail.attempt.participantId === participantId);
    if (!isOwner) throw new NotFoundException('Result not found');

    if (detail.attempt.status !== 'COMPLETED')
      throw new NotFoundException('Result not found');
    if (detail.result.status !== 'APPROVED')
      throw new ForbiddenException('result_not_released');

    // Effective pattern (corrected ?? system)
    const patternCode =
      detail.result.correctedPatternCode ?? detail.result.patternCode;
    const scoresRaw = detail.result.correctedScores ?? detail.result.scores;
    // The family decides what a participant may read: a graph, everything, or
    // nothing. Without a hook, a record that carries `graph` is reduced to it
    // (DISC's D/I/S/C), and one that does not is handed over whole — wrapping
    // it in `graph` hides the keys the result page reads (`raw`, `total`,
    // `type`, `scales`).
    const scorer = getScorer(detail.test.scorerType);
    const scores = scorer?.publicScores
      ? scorer.publicScores(scoresRaw as Record<string, unknown>)
      : scoresRaw &&
          typeof scoresRaw === 'object' &&
          !Array.isArray(scoresRaw) &&
          'graph' in scoresRaw
        ? { graph: (scoresRaw as { graph: unknown }).graph }
        : scoresRaw;

    const interp = await this.repo.findInterpretationByPattern(
      detail.test.id,
      patternCode,
    );

    return {
      patternCode,
      scorerType: detail.test.scorerType,
      scores,
      interpretation: interp,
      completedAt: detail.attempt.completedAt ?? null,
    };
  }

  // Admin: full — effective scores/pattern
  async getAdminResult(attemptId: string): Promise<{
    result: TestResult;
    interpretation: { title: string; body: string } | null;
    scores: unknown;
  }> {
    const detail = await this.repo.findAttemptWithResult(attemptId);
    if (!detail || !detail.result)
      throw new NotFoundException('Result not found');
    const patternCode =
      detail.result.correctedPatternCode ?? detail.result.patternCode;
    const interp = await this.repo.findInterpretationByPattern(
      detail.test.id,
      patternCode,
    );
    const effectiveScores =
      detail.result.correctedScores ?? detail.result.scores;
    return {
      result: detail.result,
      interpretation: interp,
      scores: effectiveScores,
    };
  }

  async listResults(
    query: QueryResultsDto,
  ): Promise<PaginatedResponse<AdminResultListItemDto>> {
    const where: Prisma.TestResultWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.sessionId) {
      where.attempt = { sessionId: query.sessionId };
    }
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.listResults({
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
}
