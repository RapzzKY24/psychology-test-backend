import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  MeOverviewData,
  MeOverviewRepository,
} from './me-overview.repository';

/** Three rows per list: the dashboard shows a preview, not a history. */
const PREVIEW_LIMIT = 3;

@Injectable()
export class PrismaMeOverviewRepository implements MeOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<MeOverviewData> {
    const [
      inProgress,
      awaitingReview,
      resultsReady,
      certificatesReady,
      pendingOrders,
      activeAttempts,
      latestResults,
      latestCertificates,
      latestOrders,
      latestUnpaidOrders,
      latestCompletedAttempts,
    ] = await Promise.all([
      this.prisma.attempt.count({ where: { userId, status: 'IN_PROGRESS' } }),
      this.prisma.testResult.count({
        where: { status: 'PENDING_REVIEW', attempt: { userId } },
      }),
      this.prisma.testResult.count({
        where: { status: 'APPROVED', attempt: { userId } },
      }),
      // Issued only: a draft has no number and is not a deliverable yet.
      this.prisma.certificate.count({
        where: {
          status: 'ACTIVE',
          number: { not: null },
          issuedAt: { not: null },
          result: { attempt: { userId } },
        },
      }),
      // Expired rows stay PENDING until a sweep closes them, but they cannot
      // be paid, so the shortcut must not count them.
      this.prisma.order.count({
        where: {
          userId,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.attempt.findMany({
        where: { userId, status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
        take: PREVIEW_LIMIT,
        select: {
          id: true,
          startedAt: true,
          test: { select: { name: true } },
        },
      }),
      this.prisma.testResult.findMany({
        where: { status: 'APPROVED', attempt: { userId } },
        // `id` breaks ties so two rows reviewed in the same millisecond keep a
        // stable order between requests.
        orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
        take: PREVIEW_LIMIT,
        select: {
          attemptId: true,
          patternCode: true,
          reviewedAt: true,
          attempt: { select: { test: { select: { name: true } } } },
        },
      }),
      this.prisma.certificate.findMany({
        where: {
          status: 'ACTIVE',
          number: { not: null },
          issuedAt: { not: null },
          result: { attempt: { userId } },
        },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        take: PREVIEW_LIMIT,
        select: {
          id: true,
          number: true,
          issuedAt: true,
          result: {
            select: {
              attempt: { select: { test: { select: { name: true } } } },
            },
          },
        },
      }),
      // Only settled payments are events; a pending order has not happened yet.
      this.prisma.order.findMany({
        where: { userId, status: 'PAID', verifiedAt: { not: null } },
        orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }],
        take: PREVIEW_LIMIT,
        select: {
          id: true,
          amount: true,
          verifiedAt: true,
          test: { select: { name: true } },
        },
      }),
      // Unpaid rows are not events, but the dashboard lists them so the
      // participant can settle one without hunting through the purchase tab.
      this.prisma.order.findMany({
        where: {
          userId,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PREVIEW_LIMIT,
        select: {
          id: true,
          amount: true,
          createdAt: true,
          expiresAt: true,
          test: { select: { name: true } },
        },
      }),
      this.prisma.attempt.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { not: null } },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        take: PREVIEW_LIMIT,
        select: {
          id: true,
          completedAt: true,
          test: { select: { name: true } },
        },
      }),
    ]);

    return {
      counts: {
        inProgress,
        awaitingReview,
        resultsReady,
        certificatesReady,
        pendingOrders,
      },
      activeAttempts: activeAttempts.map((row) => ({
        attemptId: row.id,
        testName: row.test.name,
        startedAt: row.startedAt,
      })),
      latestResults: latestResults.map((row) => ({
        attemptId: row.attemptId,
        testName: row.attempt.test.name,
        patternCode: row.patternCode,
        approvedAt: row.reviewedAt,
      })),
      latestCertificates: latestCertificates.map((row) => ({
        id: row.id,
        // The where clause excludes nulls; the cast keeps the shape honest.
        number: row.number as string,
        testName: row.result.attempt.test.name,
        issuedAt: row.issuedAt as Date,
      })),
      latestOrders: latestOrders.map((row) => ({
        orderId: row.id,
        testName: row.test.name,
        amount: row.amount,
        paidAt: row.verifiedAt as Date,
      })),
      latestUnpaidOrders: latestUnpaidOrders.map((row) => ({
        orderId: row.id,
        testName: row.test.name,
        amount: row.amount,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      })),
      latestCompletedAttempts: latestCompletedAttempts.map((row) => ({
        attemptId: row.id,
        testName: row.test.name,
        completedAt: row.completedAt as Date,
      })),
    };
  }
}
