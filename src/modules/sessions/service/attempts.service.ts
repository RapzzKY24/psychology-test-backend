import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import { ATTEMPTS_REPOSITORY } from '../repository/attempts.repository';
import type {
  AttemptsRepository,
  AttemptAccessDetail,
} from '../repository/attempts.repository';
import { ageInMonthsFromIsoDate, isoDateOf } from '../utils/age-in-months';
import {
  attemptImageDir,
  attemptImageFile,
} from '../utils/attempt-image-path';
import { ensureUploadDir } from '../../../lib/fs/ensure-upload-dir';
import { getResponseSchema, getScorer } from '../../../scorers/registry';
import { manualImagePath } from '../../../scorers/schemas/manual';
import type {
  AttemptReadDto,
  AttemptCompleteResponseDto,
} from '../dto/attempt-read.dto';
import type { PutResponseDto } from '../dto/put-response.dto';

const GRACE_MS = 24 * 60 * 60 * 1000; // decision D1: joins blocked, in-flight attempts get +24h

/** Values of the Prisma `Education` enum, in the order the gate offers them. */
const EDUCATION_LEVELS = ['SMP_SMA', 'S1', 'UMUM'];

@Injectable()
export class AttemptsService {
  constructor(
    @Inject(ATTEMPTS_REPOSITORY)
    private readonly repo: AttemptsRepository,
    private readonly config: ConfigService,
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
   * Every way an answer can be refused, in one place. A drawing is an answer
   * too, so the upload endpoint runs exactly this: if the two paths ever drift,
   * one of them starts accepting writes after the deadline.
   */
  private async assertAcceptsAnswers(
    detail: AttemptAccessDetail,
  ): Promise<void> {
    if (detail.attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException('attempt_not_in_progress');
    }
    this.assertWithinGrace(detail.session);
    // Answers are only accepted after the read recorded a fitting birth date;
    // this keeps the gate closed even for a client that guessed item ids.
    await this.assertAgeWithinBand(detail);
    await this.resolveGender(detail);
    await this.resolveEducation(detail);

    const deadline = this.deadlineOf(detail);
    if (deadline && Date.now() > deadline.getTime()) {
      throw new ConflictException('attempt_time_expired');
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

  /**
   * RMIB prints two occupation lists per group and the participant must answer
   * the one matching their sex, so a gendered test cannot be opened before the
   * attempt records one. Like the birth date, the first declaration is stored
   * and every later call reads the stored value, never a fresh one.
   *
   * Returns the gender the items should be rendered for.
   */
  private async resolveGender(
    detail: AttemptAccessDetail,
    declaredGender?: string,
  ): Promise<string | null> {
    const recorded = detail.attempt.gender;
    if (!detail.test.requiresGender) return recorded;
    if (recorded) return recorded;
    if (!declaredGender) {
      throw new UnprocessableEntityException('gender_required');
    }
    const gender = declaredGender.trim().toUpperCase();
    if (gender !== 'MALE' && gender !== 'FEMALE') {
      throw new UnprocessableEntityException('gender_invalid');
    }
    await this.repo.setGender(detail.attempt.id, gender);
    return gender;
  }

  /**
   * 16PF reads a different sten table per schooling, so an education-banded
   * test cannot be opened before the attempt records one. Like gender, the
   * first declaration is stored and every later call reads the stored value.
   */
  private async resolveEducation(
    detail: AttemptAccessDetail,
    declaredEducation?: string,
  ): Promise<string | null> {
    const recorded = detail.attempt.education;
    if (!detail.test.requiresEducation) return recorded;
    if (recorded) return recorded;
    if (!declaredEducation) {
      throw new UnprocessableEntityException('education_required');
    }
    const education = declaredEducation.trim().toUpperCase();
    if (!EDUCATION_LEVELS.includes(education)) {
      throw new UnprocessableEntityException('education_invalid');
    }
    await this.repo.setEducation(detail.attempt.id, education);
    return education;
  }

  async read(
    attemptId: string,
    participantId: string,
    declaredBirthDate?: string,
    declaredGender?: string,
    declaredEducation?: string,
  ): Promise<AttemptReadDto> {
    const detail = await this.repo.findAccessDetail(attemptId);
    if (!detail) throw new NotFoundException('Attempt not found');
    this.assertOwnerOr404(detail.attempt.participantId, participantId);
    await this.assertAgeWithinBand(detail, declaredBirthDate);
    const gender = await this.resolveGender(detail, declaredGender);
    const education = await this.resolveEducation(detail, declaredEducation);

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
      requiresGender: detail.test.requiresGender,
      gender,
      requiresEducation: detail.test.requiresEducation,
      education,
      items: detail.items.map((item) => ({
        id: item.id,
        order: item.order,
        content: scorer
          ? scorer.sanitize(item.content, detail.test.scoringConfig, { gender })
          : {},
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
    await this.assertAcceptsAnswers(detail);

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

    const parsed = getResponseSchema(
      scorer,
      detail.test.scoringConfig,
      item.content,
    ).safeParse(dto.value);
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

  /**
   * Stores one box of a projective drawing and records the answer in the same
   * call. Two calls would leave a file on disk with no response (or a response
   * pointing at a file that was never written) whenever the second one failed.
   *
   * The path comes from the two ids, so the client never names a file: a
   * drawing can only be written under its own attempt and item.
   */
  async saveItemImage(
    attemptId: string,
    itemId: string,
    participantId: string,
    file: Express.Multer.File,
  ): Promise<{ imageUrl: string }> {
    const detail = await this.repo.findAccessDetail(attemptId);
    if (!detail) throw new NotFoundException('Attempt not found');
    this.assertOwnerOr404(detail.attempt.participantId, participantId);
    await this.assertAcceptsAnswers(detail);

    const item = detail.items.find((it) => it.id === itemId);
    if (!item) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ["itemId: item does not belong to the attempt's test"],
      });
    }
    if (detail.test.scorerType !== 'MANUAL') {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ['scorerType: this test does not accept drawings'],
      });
    }

    const root = this.config.get<string>('app.uploadDir', './uploads');
    await ensureUploadDir(attemptImageDir(root, attemptId));
    await fs.promises.writeFile(
      attemptImageFile(root, attemptId, itemId),
      file.buffer,
    );

    const imageUrl = manualImagePath(attemptId, itemId);
    await this.repo.upsertResponse(attemptId, item.id, { imageUrl });
    return { imageUrl };
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
    // Same for a gendered test: the item list the participant answered came
    // from the read, so the declaration must already be on the attempt.
    await this.resolveGender(detail);
    await this.resolveEducation(detail);

    const answered = new Set(detail.responses.map((r) => r.itemId));
    const missing = detail.items
      .filter((item) => !answered.has(item.id))
      .map((item) => item.id);
    // A raw-score test treats a blank as wrong, so a timed attempt can be
    // submitted at the buzzer. The family says so itself: a hardcoded list of
    // types is how a new timed family would start rejecting its own submits.
    const allowsBlank = getScorer(detail.test.scorerType)?.allowsBlank === true;
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

    // ADR-011 norm rows live in their own table, so they are fetched once per
    // scoring pass rather than on every read/respond call.
    const normRows = await this.repo.findNormRows(detail.test.id);
    const output = await scorer.score({
      items: detail.items,
      responses: detail.responses,
      normTable: detail.test.normTable,
      normRows,
      scoringConfig: detail.test.scoringConfig,
      // KUDER reads a different percentile table per sex; the value is the
      // one recorded by the read, so a re-score always uses the same table.
      gender: detail.attempt.gender,
      // 16PF picks the sten table by schooling as well, recorded the same way.
      education: detail.attempt.education,
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
