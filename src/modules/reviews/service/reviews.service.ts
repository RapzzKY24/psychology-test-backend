import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  Inject,
} from '@nestjs/common';
import { REVIEWS_REPOSITORY } from '../repository/reviews.repository';
import type { ReviewsRepository } from '../repository/reviews.repository';
import type { QueryReviewsDto } from '../dto/query-reviews.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type {
  ReviewListItem,
  ReviewDetail,
} from '../repository/reviews.repository';
import type { Prisma, TestResult } from '../../../generated/prisma/client';
import { generateVerifyCode } from '../utils/generate-verify-code';

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(REVIEWS_REPOSITORY)
    private readonly repo: ReviewsRepository,
  ) {}

  async listReviews(
    query: QueryReviewsDto,
  ): Promise<PaginatedResponse<ReviewListItem>> {
    const where: Prisma.TestResultWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.sessionId) where.attempt = { sessionId: query.sessionId };
    if (query.testId) {
      where.attempt = {
        ...(where.attempt as object),
        testId: query.testId,
      };
    }
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.listReviews({
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

  async getDetail(resultId: string): Promise<ReviewDetail> {
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    return detail;
  }

  async updateNotes(resultId: string, notes: string) {
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    return this.repo.updateNotes(resultId, notes);
  }

  async approve(resultId: string, psychologistId: string): Promise<TestResult> {
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    if (detail.result.status === 'APPROVED')
      throw new ConflictException('result_already_approved');
    if (detail.result.status === 'RETURNED')
      throw new ConflictException('result_returned');
    if (detail.result.status !== 'PENDING_REVIEW')
      throw new ConflictException('result_already_approved');

    const profile = await this.repo.findPsychologistProfile(psychologistId);
    const complete =
      !!profile &&
      !!profile.fullName &&
      !!profile.degree &&
      !!profile.licenseNumber &&
      !!profile.signatureImagePath;
    if (!complete) throw new UnprocessableEntityException('profile_incomplete');

    let verifyCode = generateVerifyCode();
    let attempts = 0;
    while (attempts < 5) {
      const res = await this.repo.approve(resultId, psychologistId, verifyCode);
      if (res.count > 0) {
        const updated = await this.repo.findById(resultId);
        if (!updated) throw new NotFoundException('Result not found');
        return updated;
      }
      // Collision or race — retry with new code, or check actual status for 409
      const current = await this.repo.findById(resultId);
      if (!current) throw new NotFoundException('Result not found');
      if (current.status === 'APPROVED')
        throw new ConflictException('result_already_approved');
      if (current.status === 'RETURNED')
        throw new ConflictException('result_returned');
      verifyCode = generateVerifyCode();
      attempts++;
    }
    throw new ConflictException('result_already_approved');
  }

  async returnForReason(resultId: string, reason: string): Promise<TestResult> {
    if (!reason || reason.trim().length < 10) {
      throw new UnprocessableEntityException('validation_failed');
    }
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    if (detail.result.status !== 'PENDING_REVIEW')
      throw new ConflictException('result_already_approved');
    const res = await this.repo.returnForReason(resultId, reason);
    if (res.count === 0) throw new ConflictException('result_already_approved');
    const updated = await this.repo.findById(resultId);
    if (!updated) throw new NotFoundException('Result not found');
    return updated;
  }

  async applyCorrection(
    resultId: string,
    data: { scores: unknown; patternCode: string; reason: string },
    psychologistId: string,
  ): Promise<TestResult> {
    if (!data.reason || data.reason.trim().length < 10) {
      throw new UnprocessableEntityException('validation_failed');
    }
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    if (detail.result.status === 'APPROVED')
      throw new ConflictException('result_already_approved');
    if (!data.scores || !data.patternCode)
      throw new UnprocessableEntityException('validation_failed');
    return this.repo.applyCorrection(resultId, { ...data, psychologistId });
  }

  async resubmit(resultId: string): Promise<TestResult> {
    const detail = await this.repo.findDetailById(resultId);
    if (!detail) throw new NotFoundException('Result not found');
    if (detail.result.status !== 'RETURNED')
      throw new ConflictException('not_returned');
    const res = await this.repo.resubmit(resultId);
    if (res.count === 0) throw new ConflictException('not_returned');
    const updated = await this.repo.findById(resultId);
    if (!updated) throw new NotFoundException('Result not found');
    return updated;
  }
}
