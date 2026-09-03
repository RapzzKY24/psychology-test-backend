import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ReviewsRepository,
  ReviewListItem,
  ReviewDetail,
  VerifyLookup,
} from './reviews.repository';
import type { Prisma, TestResult } from '../../../generated/prisma/client';

@Injectable()
export class PrismaReviewsRepository implements ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listReviews(params: {
    where: Prisma.TestResultWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.TestResultOrderByWithRelationInput;
  }): Promise<{ data: ReviewListItem[]; total: number }> {
    const [results, total] = await Promise.all([
      this.prisma.testResult.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy ?? { computedAt: 'desc' },
        select: {
          id: true,
          status: true,
          reviewNote: true,
          computedAt: true,
          attempt: {
            select: {
              id: true,
              completedAt: true,
              userId: true,
              test: { select: { name: true } },
              session: { select: { title: true } },
              participant: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.testResult.count({ where: params.where }),
    ]);

    // Batch fetch user names for B2C attempts (userId is string, no relation)
    const userIds = [
      ...new Set(
        results
          .map(
            (r) =>
              (
                r as unknown as {
                  attempt: { userId: string | null };
                }
              ).attempt.userId,
          )
          .filter(Boolean) as string[],
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const data: ReviewListItem[] = results.map((r) => {
      const attempt = (
        r as unknown as {
          attempt: {
            test: { name: string };
            session: { title: string };
            participant?: { name: string } | null;
            userId: string | null;
            completedAt: Date | null;
          };
        }
      ).attempt;
      return {
        resultId: r.id,
        testName: attempt.test.name,
        sessionTitle: attempt.session.title,
        participantName:
          attempt.participant?.name ??
          (attempt.userId
            ? (userMap.get(attempt.userId) ?? 'Unknown')
            : 'Unknown'),
        completedAt: attempt.completedAt,
        status: r.status,
        reviewNote: r.reviewNote,
      };
    });

    return { data, total };
  }

  async findDetailById(resultId: string): Promise<ReviewDetail | null> {
    const result = await this.prisma.testResult.findUnique({
      where: { id: resultId },
    });
    if (!result) return null;

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: result.attemptId },
      include: {
        test: { select: { id: true, name: true } },
        session: { select: { id: true, title: true } },
        participant: { select: { name: true, email: true } },
        responses: { select: { itemId: true, value: true } },
      },
    });
    if (!attempt) return null;

    const items = await this.prisma.testItem.findMany({
      where: { testId: attempt.testId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, content: true },
    });

    const effectivePatternCode =
      (result as unknown as { correctedPatternCode: string | null })
        .correctedPatternCode ?? result.patternCode;
    const interpretation = await this.prisma.interpretation.findUnique({
      where: {
        testId_patternCode: {
          testId: attempt.testId,
          patternCode: effectivePatternCode,
        },
      },
      select: { title: true, body: true },
    });

    let participant: { name: string; email: string | null } | null = null;
    if (attempt.participant) {
      participant = attempt.participant;
    } else if (attempt.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: attempt.userId },
        select: { name: true, email: true },
      });
      participant = user ? { name: user.name, email: user.email } : null;
    }

    return {
      result,
      test: {
        id: (attempt as unknown as { test: { id: string; name: string } }).test
          .id,
        name: (attempt as unknown as { test: { name: string } }).test.name,
      },
      session: {
        id: (attempt as unknown as { session: { id: string; title: string } })
          .session.id,
        title: (attempt as unknown as { session: { title: string } }).session
          .title,
      },
      participant: {
        name: participant?.name ?? 'Unknown',
        email: participant?.email ?? null,
      },
      attempt: { id: attempt.id, completedAt: attempt.completedAt },
      items,
      responses: (
        attempt as unknown as {
          responses: { itemId: string; value: unknown }[];
        }
      ).responses,
      interpretation,
    };
  }

  async updateNotes(
    resultId: string,
    notes: string,
  ): Promise<import('../../../generated/prisma/client').TestResult> {
    return this.prisma.testResult.update({
      where: { id: resultId },
      data: { notes, notesUpdatedAt: new Date() },
    });
  }

  async findPsychologistProfile(userId: string): Promise<{
    fullName: string;
    degree: string;
    licenseNumber: string;
    signatureImagePath: string;
  } | null> {
    const profile = await this.prisma.psychologistProfile.findUnique({
      where: { userId },
      select: {
        fullName: true,
        degree: true,
        licenseNumber: true,
        signatureImagePath: true,
      },
    });
    return profile;
  }

  async approve(
    resultId: string,
    psychologistId: string,
    verifyCode: string,
  ): Promise<{ count: number }> {
    const result = await this.prisma.testResult.updateMany({
      where: { id: resultId, status: 'PENDING_REVIEW' },
      data: {
        status: 'APPROVED',
        reviewedById: psychologistId,
        reviewedAt: new Date(),
        verifyCode: verifyCode.toUpperCase(),
        reviewNote: null,
      },
    });
    return { count: result.count };
  }

  async returnForReason(
    resultId: string,
    reason: string,
  ): Promise<{ count: number }> {
    const result = await this.prisma.testResult.updateMany({
      where: { id: resultId, status: 'PENDING_REVIEW' },
      data: { status: 'RETURNED', reviewNote: reason },
    });
    return { count: result.count };
  }

  async applyCorrection(
    resultId: string,
    data: {
      scores: unknown;
      patternCode: string;
      reason: string;
      psychologistId: string;
    },
  ): Promise<import('../../../generated/prisma/client').TestResult> {
    return this.prisma.testResult.update({
      where: { id: resultId },
      data: {
        correctedScores: data.scores as Prisma.InputJsonValue,
        correctedPatternCode: data.patternCode,
        correctionReason: data.reason,
        correctedById: data.psychologistId,
        correctedAt: new Date(),
      },
    });
  }

  async resubmit(resultId: string): Promise<{ count: number }> {
    const result = await this.prisma.testResult.updateMany({
      where: { id: resultId, status: 'RETURNED' },
      data: { status: 'PENDING_REVIEW', reviewNote: null },
    });
    return { count: result.count };
  }

  async findById(resultId: string): Promise<TestResult | null> {
    return this.prisma.testResult.findUnique({ where: { id: resultId } });
  }

  async findByVerifyCode(code: string): Promise<VerifyLookup | null> {
    const result = await this.prisma.testResult.findUnique({
      where: { verifyCode: code.toUpperCase() },
      select: {
        id: true,
        status: true,
        verifyCode: true,
        reviewedAt: true,
        reviewedById: true,
        computedAt: true,
        attempt: {
          select: {
            completedAt: true,
            test: { select: { name: true } },
            participant: { select: { name: true } },
            userId: true,
          },
        },
      },
    });
    if (!result || result.status !== 'APPROVED' || !result.verifyCode)
      return null;

    // Fetch psychologist profile for approvedBy
    let psychologist: {
      fullName: string;
      degree: string;
      licenseNumber: string;
    } | null = null;
    if (result.reviewedById) {
      const profile = await this.prisma.psychologistProfile.findUnique({
        where: { userId: result.reviewedById },
        select: { fullName: true, degree: true, licenseNumber: true },
      });
      psychologist = profile;
    }

    // For B2C, participant is user, not participant — fetch if needed
    const attemptData = (
      result as unknown as {
        attempt: {
          participant?: { name: string } | null;
          userId: string | null;
          test: { name: string };
          completedAt: Date | null;
        };
      }
    ).attempt;
    let participantName: string | null = attemptData.participant?.name ?? null;
    if (!participantName && attemptData.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: attemptData.userId },
        select: { name: true },
      });
      participantName = user?.name ?? null;
    }

    return {
      result: result as unknown as TestResult,
      test: { name: attemptData.test.name },
      attempt: { completedAt: attemptData.completedAt },
      psychologist,
      participantName,
    };
  }
}
