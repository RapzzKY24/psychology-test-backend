import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ATTEMPTS_REPOSITORY } from '../repository/attempts.repository';
import type {
  AttemptsRepository,
  AttemptAccessDetail,
} from '../repository/attempts.repository';
import { ageInMonthsFromIsoDate, isoDateOf } from '../utils/age-in-months';
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

  /**
   * Server-side clock: the deadline is derived from `startedAt`, so a browser
   * refresh, a paused tab or a clock change cannot buy extra time.
   */
  private deadlineOf(detail: {
    attempt: { startedAt: Date };
    test: { timeLimitMin: number | null };
  }): Date | null {
    const limit = detail.test.timeLimitMin;
    if (!limit) return null;
    return new Date(detail.attempt.startedAt.getTime() + limit * 60_000);
  }

  /** Server-truth for the client countdown; null when the test is untimed. */
  private remainingSecondsOf(detail: {
    attempt: { startedAt: Date };
    test: { timeLimitMin: number | null };
  }): number | null {
    const deadline = this.deadlineOf(detail);
    if (!deadline) return null;
    return Math.max(0, Math.round((deadline.getTime() - Date.now()) / 1000));
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

  /**
   * The norm of some instruments (CFIT 2 today) is only valid inside one age
   * band, so the attempt cannot be opened by someone outside it. The first
   * declared birth date is stored on the attempt; later calls are checked
   * against the stored value, never against a fresh one, so a participant
   * cannot re-declare a date that fits after seeing the rejection.
   */
  private async assertAgeWithinBand(
    detail: AttemptAccessDetail,
    declaredBirthDate?: string,
  ): Promise<void> {
    const { ageMinMonths: min, ageMaxMonths: max } = detail.test;
    if (min == null || max == null) return;

    const recorded = detail.attempt.birthDate;
    const birthDate = recorded ? isoDateOf(recorded) : declaredBirthDate;
    if (!birthDate) {
      throw new UnprocessableEntityException('birth_date_required');
    }

    const ageMonths = ageInMonthsFromIsoDate(birthDate, new Date());
    if (ageMonths === null) {
      throw new UnprocessableEntityException('birth_date_invalid');
    }
    if (ageMonths < min || ageMonths > max) {
      throw new UnprocessableEntityException('age_out_of_band');
    }

    if (!recorded) {
      await this.repo.setBirthDate(
        detail.attempt.id,
        new Date(`${birthDate}T00:00:00.000Z`),
      );
    }
  }

  async read(
    attemptId: string,
    participantId: string,
    declaredBirthDate?: string,
  ): Promise<AttemptReadDto> {
    const detail = await this.repo.findAccessDetail(attemptId);
    if (!detail) throw new NotFoundException('Attempt not found');
    this.assertOwnerOr404(detail.attempt.participantId, participantId);
    await this.assertAgeWithinBand(detail, declaredBirthDate);

    const scorer = getScorer(detail.test.scorerType);
    return {
      id: detail.attempt.id,
      sessionId: detail.attempt.sessionId,
      testId: detail.attempt.testId,
      testName: detail.test.name,
      scorerType: detail.test.scorerType,
      status: detail.attempt.status,
      startedAt: detail.attempt.startedAt,
      completedAt: detail.attempt.completedAt,
      timeLimitMin: detail.test.timeLimitMin,
      remainingSeconds: this.remainingSecondsOf(detail),
      items: detail.items.map((item) => ({
        id: item.id,
        order: item.order,
        content: scorer ? scorer.sanitize(item.content) : {},
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

    const deadline = this.deadlineOf(detail);
    if (deadline && Date.now() > deadline.getTime()) {
      throw new ConflictException('attempt_time_expired');
    }

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

    // D4 idempotency: COMPLETED with result → return existing; COMPLETED without result → recover by re-scoring
    if (detail.attempt.status === 'COMPLETED') {
      const existing = await this.repo.findResultByAttemptId(attemptId);
      if (existing) {
        return {
          id: detail.attempt.id,
          testId: detail.attempt.testId,
          testName: detail.test.name,
          status: 'COMPLETED',
          completedAt:
            detail.attempt.completedAt ?? existing.computedAt ?? new Date(),
          result: existing,
        };
      }
      // No result — fall through to re-score (don't throw 409)
    } else if (detail.attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException('attempt_not_in_progress');
    }
    this.assertWithinGrace(detail.session);
    // A banded test never reaches scoring without a recorded birth date: the
    // read endpoint asks for it, and this check closes the direct-submit path.
    await this.assertAgeWithinBand(detail);

    const answered = new Set(detail.responses.map((r) => r.itemId));
    const missing = detail.items
      .filter((item) => !answered.has(item.id))
      .map((item) => item.id);
    // A raw-score test treats a blank as wrong, so a timed attempt can be
    // submitted at the buzzer. DISC needs every word pair to form a pattern.
    const allowsBlank = detail.test.scorerType === 'RIGHT_WRONG_NORM';
    if (missing.length > 0 && !allowsBlank) {
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
      normTable: detail.test.normTable,
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
      completedAt: result.computedAt ?? new Date(),
      result,
    };
  }
}
