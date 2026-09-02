import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ATTEMPTS_REPOSITORY } from '../repository/attempts.repository';
import type { AttemptsRepository } from '../repository/attempts.repository';
import { getScorer } from '../../../scorers/registry';
import type {
  AttemptReadDto,
  AttemptCompleteResponseDto,
} from '../dto/attempt-read.dto';
import type { PutResponseDto } from '../dto/put-response.dto';

const GRACE_MS = 24 * 60 * 60 * 1000; // decision D1: joins blocked, in-flight attempts get +24h

@Injectable()
export class AttemptsService {
  constructor(
    @Inject(ATTEMPTS_REPOSITORY)
    private readonly repo: AttemptsRepository,
  ) {}

  private assertOwnerOr404(
    participantId: string | null,
    ownerId: string,
  ): void {
    if (participantId !== ownerId) {
      throw new NotFoundException('Attempt not found');
    }
  }

  private assertWithinGrace(session: {
    status: string;
    expiresAt: Date;
  }): void {
    const graceEnd = new Date(session.expiresAt.getTime() + GRACE_MS);
    if (Date.now() > graceEnd.getTime()) {
      throw new GoneException(
        session.status === 'CLOSED' ? 'session_closed' : 'session_expired',
      );
    }
  }

  async read(
    attemptId: string,
    participantId: string,
  ): Promise<AttemptReadDto> {
    const detail = await this.repo.findAccessDetail(attemptId);
    if (!detail) throw new NotFoundException('Attempt not found');
    this.assertOwnerOr404(detail.attempt.participantId, participantId);

    const scorer = getScorer(detail.test.scorerType);
    return {
      id: detail.attempt.id,
      sessionId: detail.attempt.sessionId,
      testId: detail.attempt.testId,
      testName: detail.test.name,
      status: detail.attempt.status,
      startedAt: detail.attempt.startedAt,
      completedAt: detail.attempt.completedAt,
      items: detail.items.map((item) => ({
        id: item.id,
        order: item.order,
        content: scorer
          ? scorer.sanitize(item.content)
          : (item.content as Record<string, unknown>),
      })),
      responses: detail.responses,
    };
  }

  async respond(
    attemptId: string,
    dto: PutResponseDto,
    participantId: string,
  ): Promise<void> {
    const detail = await this.repo.findAccessDetail(attemptId);
    if (!detail) throw new NotFoundException('Attempt not found');
    this.assertOwnerOr404(detail.attempt.participantId, participantId);

    if (detail.attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException('attempt_not_in_progress');
    }
    this.assertWithinGrace(detail.session);

    const item = detail.items.find((it) => it.id === dto.itemId);
    if (!item) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ["itemId: item does not belong to the attempt's test"],
      });
    }

    const scorer = getScorer(detail.test.scorerType);
    if (!scorer) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [`scorerType: ${detail.test.scorerType} is not supported`],
      });
    }

    const parsed = scorer.responseSchema.safeParse(dto.value);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [
          `value: ${parsed.error.issues
            .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
            .join(', ')}`,
        ],
      });
    }

    await this.repo.upsertResponse(attemptId, item.id, parsed.data);
  }

  async complete(
    attemptId: string,
    participantId: string,
  ): Promise<AttemptCompleteResponseDto> {
    const detail = await this.repo.findAccessDetail(attemptId);
    if (!detail) throw new NotFoundException('Attempt not found');
    this.assertOwnerOr404(detail.attempt.participantId, participantId);

    // D4 idempotency fast path: already completed -> return the existing result.
    if (detail.attempt.status === 'COMPLETED') {
      const existing = await this.repo.findResultByAttemptId(attemptId);
      if (existing) {
        return {
          id: detail.attempt.id,
          testId: detail.attempt.testId,
          testName: detail.test.name,
          status: 'COMPLETED',
          completedAt: detail.attempt.completedAt ?? new Date(),
          result: existing,
        };
      }
    }

    if (detail.attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException('attempt_not_in_progress');
    }
    this.assertWithinGrace(detail.session);

    const answered = new Set(detail.responses.map((r) => r.itemId));
    const missing = detail.items
      .filter((item) => !answered.has(item.id))
      .map((item) => item.id);
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [`missing responses for items: ${missing.join(', ')}`],
      });
    }

    const scorer = getScorer(detail.test.scorerType);
    if (!scorer) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [`scorerType: ${detail.test.scorerType} is not supported`],
      });
    }

    const output = await scorer.score({
      items: detail.items,
      responses: detail.responses,
    });
    const result = await this.repo.completeAndCreateResult({
      attemptId,
      scores: output.scores,
      patternCode: output.patternCode,
    });

    return {
      id: detail.attempt.id,
      testId: detail.attempt.testId,
      testName: detail.test.name,
      status: 'COMPLETED',
      completedAt: new Date(),
      result,
    };
  }
}
