import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ReviewsRepository,
  ReviewListItem,
  ReviewDetail,
} from './reviews.repository';
import type { Prisma } from '../../../generated/prisma/client';

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

    const interpretation = await this.prisma.interpretation.findUnique({
      where: {
        testId_patternCode: {
          testId: attempt.testId,
          patternCode: result.patternCode,
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
}
