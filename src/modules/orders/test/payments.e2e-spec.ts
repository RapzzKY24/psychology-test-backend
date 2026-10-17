import 'dotenv/config';
import * as fs from 'fs';
import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaOrdersRepository } from '../repository/orders.prisma-repository';
import { PrismaQrisRepository } from '../repository/qris.prisma-repository';
import { OrdersService } from '../service/orders.service';
import { OrderVaService } from '../service/order-va.service';
import { QrisService } from '../service/qris.service';
import { validateQrisFile } from '../utils/validate-qris-file';
import { PrismaInvoicesRepository } from '../../invoices/repository/invoices.prisma-repository';
import { InvoicesService } from '../../invoices/service/invoices.service';
import { PrismaEventLogRepository } from '../../event-log/repository/event-log.prisma-repository';
import { EventLogService } from '../../event-log/service/event-log.service';
import { PrismaIdempotencyRepository } from '../../idempotency/repository/idempotency.prisma-repository';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { PaymentsService } from '../../payments/service/payments.service';
import { GDC_ACK } from '../../payments/constants/payments';

/**
 * Feature 07 integration tests against the real DB
 * (docs/features/07-payments.md → Testing: full flow order → claim →
 * expire → late verify → attempt usable; double-verify race; cancel path;
 * ownership 404s; QRIS upload + streaming; admin payments list).
 * Follows the repo pattern of src/modules/tests/test/tests-transaction.e2e-spec.ts
 * (real PrismaService + strict cleanup).
 */
describe('Payments E2E (integ, real DB)', () => {
  const prefix = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const configStub = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'app.paymentTtlMin') return 60;
      if (key === 'app.uploadDir') return './uploads';
      return def;
    }),
  };

  let prisma: PrismaService;
  let ordersService: OrdersService;
  let qrisService: QrisService;
  let paymentsService: PaymentsService;

  const userIds: string[] = [];
  const orderIds: string[] = [];
  const sessionIds: string[] = [];
  const attemptIds: string[] = [];
  const qrisFiles: string[] = [];
  const invoiceIds: string[] = [];
  const institutionIds: string[] = [];
  let testId: string;
  let itemIds: string[] = [];
  let originalQrisSetting: { key: string; value: { path?: string } } | null =
    null;

  const buyerId = `${prefix}-buyer`;
  const buyerEmail = `${buyerId}@test.local`;
  const adminId = `${prefix}-admin`;
  const adminEmail = `${adminId}@test.local`;

  async function createOrder(userId = buyerId) {
    const order = await ordersService.create(testId, userId);
    orderIds.push(order.orderId);
    return order;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // Capture + clear the QRIS setting so order creation asserts qrisImageUrl null
    const existing = await prisma.setting.findUnique({
      where: { key: 'payment.qrisImagePath' },
    });
    originalQrisSetting = existing as {
      key: string;
      value: { path?: string };
    } | null;
    if (existing) {
      await prisma.setting.delete({ where: { key: 'payment.qrisImagePath' } });
    }

    userIds.push(buyerId, adminId);
    await prisma.user.create({
      data: {
        id: buyerId,
        name: 'E2E Buyer',
        email: buyerEmail,
        emailVerified: true,
      },
    });
    await prisma.user.create({
      data: {
        id: adminId,
        name: 'E2E Admin',
        email: adminEmail,
        emailVerified: true,
      },
    });

    const test = await prisma.test.create({
      data: {
        // Not prefixed with 'e2e-' on purpose: tests-transaction.e2e-spec
        // wipes every 'e2e-*' test in its beforeAll/afterAll, and jest runs
        // suites in parallel — a shared prefix would cause FK collisions.
        slug: `payments-int-${prefix}-test`,
        name: 'E2E Payments Test',
        description: 'E2E payments integration test description',
        category: 'PERSONALITY',
        scorerType: 'FORCED_CHOICE_DISC',
        price: 200000,
        estimatedDurationMin: 10,
        status: 'PUBLISHED',
      },
    });
    testId = test.id;

    await prisma.testItem.createMany({
      data: [0, 1, 2, 3].map((i) => ({
        testId,
        order: i + 1,
        content: {
          words: ['wordA', 'wordB', 'wordC', 'wordD'],
          mostMapping: ['D', 'I', 'S', 'C'],
          leastMapping: ['C', 'S', 'I', 'D'],
        },
      })),
    });
    itemIds = (
      await prisma.testItem.findMany({
        where: { testId },
        orderBy: { order: 'asc' },
      })
    ).map((it) => it.id);

    const ordersRepository = new PrismaOrdersRepository(prisma);
    const orderVaStub = new OrderVaService(
      ordersRepository,
      {} as never,
      {} as never,
      {} as never,
      configStub as never,
    );
    ordersService = new OrdersService(
      ordersRepository,
      configStub as never,
      orderVaStub,
    );
    qrisService = new QrisService(
      new PrismaQrisRepository(prisma),
      configStub as never,
    );
    paymentsService = new PaymentsService(
      ordersService,
      new InvoicesService(new PrismaInvoicesRepository(prisma)),
      new EventLogService(new PrismaEventLogRepository(prisma)),
      new IdempotencyService(new PrismaIdempotencyRepository(prisma)),
      {} as never,
      configStub as never,
    );
  });

  afterAll(async () => {
    // Cleanup in FK-dependency order. Discover any sessions/attempts created
    // for the e2e orders (tracked or not) so cleanup never leaves orphans.
    const sessionsFromOrders = await prisma.testSession.findMany({
      where: { title: { in: orderIds.map((id) => `Order ${id}`) } },
      select: { id: true },
    });
    const allSessionIds = [
      ...new Set([...sessionIds, ...sessionsFromOrders.map((s) => s.id)]),
    ];
    const attemptsForSessions = allSessionIds.length
      ? await prisma.attempt.findMany({
          where: { sessionId: { in: allSessionIds } },
          select: { id: true },
        })
      : [];
    const allAttemptIds = [
      ...new Set([...attemptIds, ...attemptsForSessions.map((a) => a.id)]),
    ];
    await prisma.response.deleteMany({
      where: { attemptId: { in: allAttemptIds } },
    });
    await prisma.testResult.deleteMany({
      where: { attemptId: { in: allAttemptIds } },
    });
    await prisma.attempt.deleteMany({ where: { id: { in: allAttemptIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.testSession.deleteMany({
      where: { id: { in: allSessionIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.testItem.deleteMany({ where: { testId } });
    await prisma.test.deleteMany({ where: { id: testId } });
    await prisma.institution.deleteMany({
      where: { id: { in: institutionIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    // Remove files written by the QRIS test (uploaded under ./uploads/qris)
    for (const file of qrisFiles) {
      await fs.promises.unlink(file).catch(() => {});
    }
    // Restore the previous QRIS setting (or leave it unset if there was none)
    if (originalQrisSetting) {
      await prisma.setting.upsert({
        where: { key: 'payment.qrisImagePath' },
        create: originalQrisSetting,
        update: originalQrisSetting,
      });
    } else {
      await prisma.setting.deleteMany({
        where: { key: 'payment.qrisImagePath' },
      });
    }

    await prisma.$disconnect();
  });
  describe('buyer order flow (7.1)', () => {
    it('creates an order with amount = price + unique code, 60min expiry, null qris url', async () => {
      const order = await createOrder();
      expect(order.basePrice).toBe(200000);
      expect(order.uniqueCode).toBeGreaterThanOrEqual(1);
      expect(order.uniqueCode).toBeLessThanOrEqual(999);
      expect(order.amount).toBe(200000 + order.uniqueCode);
      expect(order.qrisImageUrl).toBeNull();
      const minutes = (order.expiresAt.getTime() - Date.now()) / 60000;
      expect(minutes).toBeGreaterThan(59);
      expect(minutes).toBeLessThanOrEqual(60);
    });

    it('lazy expiry: PENDING past expiresAt is persisted as EXPIRED on read', async () => {
      const order = await createOrder();
      await prisma.order.update({
        where: { id: order.orderId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const result = await ordersService.findById(order.orderId, buyerId);
      expect(result.status).toBe('EXPIRED');
      expect(result.secondsRemaining).toBeNull();
      const row = await prisma.order.findUniqueOrThrow({
        where: { id: order.orderId },
      });
      expect(row.status).toBe('EXPIRED');
    });

    it('returns 404 for another user (owner-only, no existence leak)', async () => {
      const order = await createOrder();
      await expect(
        ordersService.findById(order.orderId, adminId),
      ).rejects.toThrow('Order not found');
      await expect(ordersService.claim(order.orderId, adminId)).rejects.toThrow(
        'Order not found',
      );
    });

    it('claim is idempotent: second call keeps the original timestamp', async () => {
      const order = await createOrder();
      const first = await ordersService.claim(order.orderId, buyerId);
      const second = await ordersService.claim(order.orderId, buyerId);
      expect(second.userClaimedAt.getTime()).toBe(
        first.userClaimedAt.getTime(),
      );
      const row = await prisma.order.findUniqueOrThrow({
        where: { id: order.orderId },
      });
      expect(row.userClaimedAt!.getTime()).toBe(first.userClaimedAt.getTime());
    });
  });
  describe('admin verify/cancel (7.2)', () => {
    it('verifies PENDING → PAID + INDIVIDUAL session + attempt owned by buyer, attempt usable', async () => {
      const order = await createOrder();
      await ordersService.claim(order.orderId, buyerId);

      const result = await ordersService.verify(order.orderId, adminId);
      expect(result.status).toBe('PAID');
      expect(result.wasLate).toBe(false);
      expect(result.sessionId).toBeDefined();
      expect(result.attemptId).toBeDefined();
      sessionIds.push(result.sessionId);
      attemptIds.push(result.attemptId);

      const row = await prisma.order.findUniqueOrThrow({
        where: { id: order.orderId },
      });
      expect(row.status).toBe('PAID');
      expect(row.verifiedById).toBe(adminId);
      expect(row.verifiedAt).not.toBeNull();

      const session = await prisma.testSession.findUniqueOrThrow({
        where: { id: result.sessionId },
      });
      expect(session.kind).toBe('INDIVIDUAL');
      expect(session.status).toBe('ACTIVE');
      expect(session.slotLimit).toBe(1);
      expect(session.token).toBeTruthy();
      expect(session.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 29 * 24 * 3600 * 1000,
      );

      const attempt = await prisma.attempt.findUniqueOrThrow({
        where: { id: result.attemptId },
      });
      expect(attempt.userId).toBe(buyerId);
      expect(attempt.testId).toBe(testId);
      expect(attempt.status).toBe('IN_PROGRESS');

      // "attempt usable": a response can be stored against the unlocked attempt
      await prisma.response.create({
        data: {
          attemptId: result.attemptId,
          itemId: itemIds[0],
          value: { most: 0, least: 1 },
        },
      });
      const responses = await prisma.response.findMany({
        where: { attemptId: result.attemptId },
      });
      expect(responses).toHaveLength(1);
    });

    it('late-verifies an EXPIRED order → wasLate true, exactly one unlock', async () => {
      const order = await createOrder();
      await prisma.order.update({
        where: { id: order.orderId },
        data: { status: 'EXPIRED' },
      });
      const result = await ordersService.verify(order.orderId, adminId);
      expect(result.wasLate).toBe(true);
      expect(result.sessionId).toBeDefined();
      sessionIds.push(result.sessionId);
      attemptIds.push(result.attemptId);
      const sessions = await prisma.testSession.count({
        where: { title: `Order ${order.orderId}` },
      });
      expect(sessions).toBe(1);
    });

    it('double verify race → one 200, one 409 already_verified, exactly one session + attempt', async () => {
      const order = await createOrder();
      const settled = await Promise.allSettled([
        ordersService.verify(order.orderId, adminId),
        ordersService.verify(order.orderId, adminId),
      ]);
      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const err = rejected[0].reason as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('already_verified');
      const sessions = await prisma.testSession.count({
        where: { title: `Order ${order.orderId}` },
      });
      expect(sessions).toBe(1);
      const session = await prisma.testSession.findFirstOrThrow({
        where: { title: `Order ${order.orderId}` },
      });
      sessionIds.push(session.id);
      const attempts = await prisma.attempt.findMany({
        where: { sessionId: session.id },
      });
      expect(attempts).toHaveLength(1);
      attemptIds.push(attempts[0].id);
    });
    it('cancel records the reason and blocks later verify (409 order_cancelled)', async () => {
      const order = await createOrder();
      const result = await ordersService.cancel(
        order.orderId,
        'salah cocok mutasi',
      );
      expect(result.status).toBe('CANCELLED');
      const row = await prisma.order.findUniqueOrThrow({
        where: { id: order.orderId },
      });
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelReason).toBe('salah cocok mutasi');
      await expect(
        ordersService.verify(order.orderId, adminId),
      ).rejects.toThrow('order_cancelled');
    });

    it('verify of an already PAID order → 409 already_verified', async () => {
      const order = await createOrder();
      const first = await ordersService.verify(order.orderId, adminId);
      sessionIds.push(first.sessionId);
      attemptIds.push(first.attemptId);
      await expect(
        ordersService.verify(order.orderId, adminId),
      ).rejects.toThrow('already_verified');
    });
  });

  describe('admin payments list (7.2 contract)', () => {
    it('returns the flat contract shape with claimed/verifiedBy enrichment', async () => {
      const order = await createOrder();
      await ordersService.verify(order.orderId, adminId);
      const { data, total } = await ordersService.listPayments({
        amount: order.amount,
        page: 1,
        limit: 10,
      });
      expect(total).toBeGreaterThanOrEqual(1);
      const row = data.find((item) => item.orderId === order.orderId);
      expect(row).toBeDefined();
      expect(row!.orderId).toBe(order.orderId);
      expect(row!.userName).toBe('E2E Buyer');
      expect(row!.userEmail).toBe(buyerEmail);
      expect(row!.testName).toBe('E2E Payments Test');
      expect(row!.amount).toBe(order.amount);
      expect(row!.uniqueCode).toBe(order.uniqueCode);
      expect(row!.status).toBe('PAID');
      expect(row!.claimed).toBe(false);
      expect(row!.verifiedBy).toEqual({
        id: adminId,
        name: 'E2E Admin',
        email: adminEmail,
      });
    });
  });

  describe('session invoice VA callback (T11)', () => {
    async function seedPendingInvoice() {
      const invoiceVa = `88${Math.floor(Math.random() * 1e9)
        .toString()
        .padStart(9, '0')}`;
      const owner = await prisma.user.create({
        data: {
          id: `${prefix}-inv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name: 'Invoice Owner',
          email: `${prefix}-inv-${Math.random().toString(36).slice(2, 7)}@test.local`,
          emailVerified: true,
        },
      });
      userIds.push(owner.id);
      const institution = await prisma.institution.create({
        data: {
          name: `${prefix} Invoice Corp`,
          contactName: 'Invoice Owner',
          contactEmail: `${owner.id}@test.local`,
          ownerUserId: owner.id,
        },
      });
      institutionIds.push(institution.id);
      const session = await prisma.testSession.create({
        data: {
          title: `${prefix} Invoice Sesi`,
          kind: 'GROUP',
          token: `${prefix}-inv-token-${Math.random().toString(36).slice(2, 6)}`,
          slotLimit: 5,
          expiresAt: new Date(Date.now() + 3600_000),
          joinMode: 'ROSTER',
          status: 'PENDING_PAYMENT',
          institutionId: institution.id,
        },
      });
      sessionIds.push(session.id);
      const invoice = await prisma.invoice.create({
        data: {
          number: `${prefix}-INV-${Math.random().toString(36).slice(2, 6)}`,
          institutionId: institution.id,
          amount: 200000,
          status: 'UNPAID',
          sessionId: session.id,
          vaNumber: invoiceVa,
          gdcExternalId: session.id,
          paymentProvider: 'GDC_VA',
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      invoiceIds.push(invoice.id);
      return { session, invoice, invoiceVa };
    }

    const callbackFor = (virtualAccountNo: string) => ({
      partnerServiceId: '   GDC',
      customerNo: '12345',
      virtualAccountNo,
      virtualAccountName: 'INV',
      trxId: 'trxCb',
      paymentRequestId: 'prCb',
      sourceBankCode: '014',
      paidAmount: { value: '200000.00', currency: 'IDR' },
      totalAmount: { value: '200000.00', currency: 'IDR' },
      trxDateTime: '2026-10-17T06:00:00+07:00',
      referenceNo: 'ref-cb',
      additionalInfo: {
        paymentDate: '2026-10-17T06:00:00+07:00',
        paymentMethod: 'TRANSFER',
        transactionType: 'C',
        latestTransactionStatus: '00',
        transactionStatusDesc: 'Success',
      },
    });

    it('settles the invoice, activates the session, and acks', async () => {
      const { session, invoice, invoiceVa } = await seedPendingInvoice();

      const ack = await paymentsService.handleVaCallback(
        callbackFor(invoiceVa),
      );
      expect(ack).toEqual(GDC_ACK);

      const paid = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
      });
      expect(paid.status).toBe('PAID');
      expect(paid.verifiedBySource).toBe('GDC');

      const activated = await prisma.testSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(activated.status).toBe('ACTIVE');
    });

    it('is idempotent on duplicate delivery (no double activation)', async () => {
      const { session, invoice, invoiceVa } = await seedPendingInvoice();

      await paymentsService.handleVaCallback(callbackFor(invoiceVa));
      await paymentsService.handleVaCallback(callbackFor(invoiceVa));

      const paid = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
      });
      expect(paid.status).toBe('PAID');
      const activated = await prisma.testSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(activated.status).toBe('ACTIVE');
    });
  });

  describe('QRIS settings (7.3)', () => {
    it('rejects bad uploads (415 unsupported / 413 too large) before any write', () => {
      const small = Buffer.from('png-bytes');
      expect(() =>
        validateQrisFile({
          buffer: small,
          mimetype: 'application/pdf',
          size: small.length,
        } as Express.Multer.File),
      ).toThrow(UnsupportedMediaTypeException);
      expect(() =>
        validateQrisFile({
          buffer: Buffer.alloc(3 * 1024 * 1024),
          mimetype: 'image/png',
          size: 3 * 1024 * 1024 + 1,
        } as Express.Multer.File),
      ).toThrow(PayloadTooLargeException);
    });

    it('uploads a QRIS image, stores the path, serves it back, then order creation exposes the url', async () => {
      const buf = Buffer.from('fakepng;1694292920;');
      const saved = await qrisService.saveImage({
        buffer: buf,
        mimetype: 'image/png',
        size: buf.length,
      } as Express.Multer.File);
      expect(saved.qrisImageUrl).toBe('/api/v1/public/payments/qris-image');

      const filePath = await qrisService.getImagePath();
      const onDisk = await fs.promises.readFile(filePath);
      expect(onDisk.equals(buf)).toBe(true);
      qrisFiles.push(filePath);

      // Order creation now exposes the QRIS url to the popup
      const order = await createOrder();
      expect(order.qrisImageUrl).toBe('/api/v1/public/payments/qris-image');
    });
  });
});
