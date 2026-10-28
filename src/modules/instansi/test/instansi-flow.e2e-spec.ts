import 'dotenv/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaSessionsRepository } from '../../sessions/repository/sessions.prisma-repository';
import { InstansiParticipantsPrismaRepository } from '../repository/instansi-participants.prisma-repository';
import { PrismaInstitutionsRepository } from '../../institutions/repository/institutions.prisma-repository';
import { PrismaTestsRepository } from '../../tests/repository/tests.prisma-repository';
import { PrismaInvoicesRepository } from '../../invoices/repository/invoices.prisma-repository';
import { InvoicesService } from '../../invoices/service/invoices.service';
import { PrismaResultsRepository } from '../../results/repository/results.prisma-repository';
import { SessionsService } from '../../sessions/service/sessions.service';
import { SessionsPublicService } from '../../sessions/service/sessions-public.service';
import { InstansiParticipantsService } from '../service/instansi-participants.service';
import { InstansiSessionsService } from '../service/instansi-sessions.service';
import { InstansiOverviewService } from '../service/instansi-overview.service';
import { InstansiStatsService } from '../service/instansi-stats.service';
import { PrismaInstansiStatsRepository } from '../repository/instansi-stats.prisma-repository';

/**
 * T3 end-to-end (real DB, real services, no HTTP):
 * register institution → add employees → create session from employees →
 * employee claims via roster picker → overview rekap reflects it.
 */
describe('Instansi flow (integration, DB real)', () => {
  let prisma: PrismaService;
  let sessionsService: InstansiSessionsService;
  let invoicesService: InvoicesService;
  let publicService: SessionsPublicService;
  let overviewService: InstansiOverviewService;

  const tag = `e2e-${Date.now()}`;
  let userId: string;
  let institutionId: string;
  let testId: string;
  let sessionId: string;
  const seatIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const sessionsRepo = new PrismaSessionsRepository(prisma);
    const participantsRepo = new InstansiParticipantsPrismaRepository(prisma);
    const institutionsRepo = new PrismaInstitutionsRepository(prisma);
    const testsRepo = new PrismaTestsRepository(prisma);
    const participantsService = new InstansiParticipantsService(
      participantsRepo,
      institutionsRepo,
    );
    invoicesService = new InvoicesService(new PrismaInvoicesRepository(prisma));
    sessionsService = new InstansiSessionsService(
      sessionsRepo,
      participantsRepo,
      testsRepo,
      institutionsRepo,
      participantsService,
      new SessionsService(sessionsRepo),
      invoicesService,
      {
        isEnabled: () => true,
        provision: () => Promise.resolve(null),
      } as never,
      { get: (_key: string, fallback: unknown) => fallback } as never,
    );
    publicService = new SessionsPublicService(sessionsRepo);
    overviewService = new InstansiOverviewService(
      sessionsRepo,
      participantsRepo,
      participantsService,
    );

    const user = await prisma.user.create({
      data: {
        id: `${tag}-user`,
        name: 'HR E2E',
        email: `${tag}@example.com`,
        role: 'INSTANSI',
      },
    });
    userId = user.id;

    const institution = await prisma.institution.create({
      data: {
        name: `${tag} Corp`,
        contactName: 'HR E2E',
        contactEmail: `${tag}@example.com`,
        ownerUserId: userId,
      },
    });
    institutionId = institution.id;

    const test = await prisma.test.create({
      data: {
        slug: `${tag}-disc`,
        name: 'E2E DISC',
        description: 'E2E test description 12345',
        category: 'PERSONALITY',
        scorerType: 'FORCED_CHOICE_DISC',
        price: 100000,
        estimatedDurationMin: 10,
        status: 'PUBLISHED',
      },
    });
    testId = test.id;
    await prisma.testItem.create({
      data: { testId, order: 1, content: {} },
    });
  });

  afterAll(async () => {
    await prisma.testResult.deleteMany({
      where: { attempt: { sessionId } },
    });
    await prisma.attempt.deleteMany({
      where: { participantId: { in: seatIds } },
    });
    await prisma.sessionParticipant.deleteMany({
      where: { id: { in: seatIds } },
    });
    await prisma.invoice.deleteMany({ where: { sessionId } });
    await prisma.sessionTest.deleteMany({ where: { sessionId } });
    await prisma.testSession.deleteMany({ where: { id: sessionId } });
    await prisma.institutionParticipant.deleteMany({
      where: { institutionId },
    });
    await prisma.testItem.deleteMany({ where: { testId } });
    await prisma.test.deleteMany({ where: { id: testId } });
    await prisma.institution.deleteMany({ where: { id: institutionId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates employees, a ROSTER session, claims a seat, and reflects rekap', async () => {
    // Given: two employees
    const emp1 = await prisma.institutionParticipant.create({
      data: {
        institutionId,
        name: 'Budi Santoso',
        destinationCountry: 'Jepang',
        idType: 'NIK',
        idNumber: `${tag}-001`,
      },
    });
    const emp2 = await prisma.institutionParticipant.create({
      data: {
        institutionId,
        name: 'Siti Rahayu',
        destinationCountry: 'Korea',
        idType: 'PASPOR',
        idNumber: `${tag}-002`,
      },
    });

    // When: HR buys 10 slots for the test — no names yet (one door: catalog)
    const { session, invoice } = await sessionsService.create(userId, {
      testIds: [testId],
      employeeIds: [],
      slotLimit: 10,
    });
    sessionId = session.id;
    expect(session.joinMode).toBe('ROSTER');
    expect(session.institutionId).toBe(institutionId);
    expect(session.status).toBe('PENDING_PAYMENT');
    // 100000 per test × 10 slots bought up front
    expect(invoice.amount).toBe(1000000);
    expect(invoice.vaNumber).toBeNull();

    const emptyRoster = await prisma.sessionParticipant.findMany({
      where: { sessionId },
    });
    expect(emptyRoster).toHaveLength(0);

    // When: the batch invoice settles, the session activates
    const settlement = await invoicesService.confirmPaymentWithActivation(
      invoice.id,
      { paidAmount: invoice.amount, verifiedBySource: 'JOKUL' },
    );
    expect(settlement.outcome).toBe('confirmed');
    const activated = await prisma.testSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(activated.status).toBe('ACTIVE');

    // When: HR fills the names AFTER paying — roster edit never re-bills
    const afterAdd = await sessionsService.addParticipants(userId, sessionId, {
      employeeIds: [emp1.id, emp2.id],
    });
    expect(afterAdd.amount).toBe(1000000);

    const seats = await prisma.sessionParticipant.findMany({
      where: { sessionId },
      orderBy: { name: 'asc' },
    });
    expect(seats).toHaveLength(2);
    expect(seats[0].institutionParticipantId).toBe(emp1.id);
    seats.forEach((s) => seatIds.push(s.id));

    // When: employee claims their seat via the roster picker
    const claimed = await publicService.claim(
      session.token,
      seats[0].id,
      '127.0.0.1',
    );
    expect(claimed.participantToken).toBeDefined();
    expect(claimed.attempts).toHaveLength(1);

    // A locked seat cannot be claimed from another device
    await expect(
      publicService.claim(session.token, seats[0].id, '127.0.0.2'),
    ).rejects.toThrow('seat_claimed');

    // Operator reset releases the lock; the candidate re-claims from a new
    // device and keeps their progress (attempts are not duplicated).
    await sessionsService.resetParticipant(userId, sessionId, seats[0].id);
    const reclaimed = await publicService.claim(
      session.token,
      seats[0].id,
      '127.0.0.3',
    );
    expect(reclaimed.participantToken).toBeDefined();
    expect(reclaimed.attempts).toHaveLength(1);

    // Then: overview rekap reflects it
    const overview = await overviewService.getOverview(userId);
    expect(overview).toEqual({
      employees: 2,
      sessions: 1,
      attempts: { total: 1, inProgress: 1, completed: 0 },
    });
  });

  it('lists only the caller institution APPROVED results', async () => {
    const resultsRepo = new PrismaResultsRepository(prisma);
    const attempt = await prisma.attempt.findFirstOrThrow({
      where: { participantId: seatIds[0], testId },
    });

    // One APPROVED row for our institution.
    await prisma.testResult.create({
      data: {
        attemptId: attempt.id,
        scores: { D: 1 },
        patternCode: 'SC',
        status: 'APPROVED',
        reviewedAt: new Date(),
      },
    });
    // A PENDING row in the same session must be excluded.
    const otherSeatAttempt = await prisma.attempt.create({
      data: {
        sessionId,
        testId,
        participantId: seatIds[1],
        status: 'IN_PROGRESS',
      },
    });
    await prisma.testResult.create({
      data: {
        attemptId: otherSeatAttempt.id,
        scores: {},
        patternCode: 'SC',
        status: 'PENDING_REVIEW',
      },
    });
    // An APPROVED row from another institution must not leak.
    const otherUser = await prisma.user.create({
      data: {
        id: `${tag}-user-other`,
        name: 'Other Owner',
        email: `${tag}-other@example.com`,
        role: 'INSTANSI',
      },
    });
    const otherInstitution = await prisma.institution.create({
      data: {
        name: `${tag} Other`,
        contactName: 'Other',
        contactEmail: `${tag}-other@example.com`,
        ownerUserId: otherUser.id,
      },
    });
    const otherSession = await prisma.testSession.create({
      data: {
        title: `${tag} Other Sesi`,
        kind: 'GROUP',
        token: `${tag}-other-token`,
        slotLimit: 5,
        expiresAt: new Date(Date.now() + 3600_000),
        joinMode: 'ROSTER',
        institutionId: otherInstitution.id,
      },
    });
    const otherAttempt = await prisma.attempt.create({
      data: {
        sessionId: otherSession.id,
        testId,
        userId: otherUser.id,
        status: 'COMPLETED',
      },
    });
    await prisma.testResult.create({
      data: {
        attemptId: otherAttempt.id,
        scores: {},
        patternCode: 'SC',
        status: 'APPROVED',
        reviewedAt: new Date(),
      },
    });

    const { data, total } = await resultsRepo.listApprovedByInstitution({
      institutionId,
      skip: 0,
      take: 10,
    });
    expect(total).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0].participantName).toBe('Budi Santoso');
    expect(data[0].resultId).toBeDefined();

    // Cleanup the extra fixtures.
    await prisma.testResult.deleteMany({
      where: { attemptId: { in: [attempt.id, otherSeatAttempt.id] } },
    });
    await prisma.attempt.delete({ where: { id: otherSeatAttempt.id } });
    await prisma.testResult.deleteMany({
      where: { attemptId: otherAttempt.id },
    });
    await prisma.attempt.delete({ where: { id: otherAttempt.id } });
    await prisma.testSession.delete({ where: { id: otherSession.id } });
    await prisma.institution.delete({ where: { id: otherInstitution.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });

  it('reports per-session progress for the caller institution only', async () => {
    // Given: a fresh session with three seats — one finished, one running, one untouched.
    const statsSession = await prisma.testSession.create({
      data: {
        title: `${tag} Stats Sesi`,
        kind: 'GROUP',
        token: `${tag}-stats-token`,
        slotLimit: 5,
        expiresAt: new Date(Date.now() + 3600_000),
        joinMode: 'ROSTER',
        institutionId,
      },
    });
    const seats = await Promise.all(
      ['Selesai', 'Berjalan', 'Belum'].map((name, index) =>
        prisma.sessionParticipant.create({
          data: {
            sessionId: statsSession.id,
            name: `${tag} ${name}`,
            candidateNumber: `S${index + 1}`,
          },
        }),
      ),
    );
    const [doneSeat, runningSeat] = seats;
    const doneAttempt = await prisma.attempt.create({
      data: {
        sessionId: statsSession.id,
        testId,
        participantId: doneSeat.id,
        status: 'COMPLETED',
      },
    });
    const runningAttempt = await prisma.attempt.create({
      data: {
        sessionId: statsSession.id,
        testId,
        participantId: runningSeat.id,
        status: 'IN_PROGRESS',
      },
    });

    // And a session owned by somebody else, which must never show up.
    const foreignUser = await prisma.user.create({
      data: {
        id: `${tag}-stats-foreign`,
        name: 'Foreign Owner',
        email: `${tag}-stats-foreign@example.com`,
        role: 'INSTANSI',
      },
    });
    const foreignInstitution = await prisma.institution.create({
      data: {
        name: `${tag} Stats Foreign`,
        contactName: 'Foreign',
        contactEmail: `${tag}-stats-foreign@example.com`,
        ownerUserId: foreignUser.id,
      },
    });
    const foreignSession = await prisma.testSession.create({
      data: {
        title: `${tag} Foreign Sesi`,
        kind: 'GROUP',
        token: `${tag}-stats-foreign-token`,
        slotLimit: 3,
        expiresAt: new Date(Date.now() + 3600_000),
        institutionId: foreignInstitution.id,
      },
    });

    const statsService = new InstansiStatsService(
      new PrismaInstansiStatsRepository(prisma),
      new InstansiParticipantsService(
        new InstansiParticipantsPrismaRepository(prisma),
        new PrismaInstitutionsRepository(prisma),
      ),
    );

    // When
    const { sessions } = await statsService.getProgress(userId, 10);

    // Then
    const progress = sessions.find((row) => row.sessionId === statsSession.id);
    expect(progress).toMatchObject({
      slotLimit: 5,
      completed: 1,
      inProgress: 1,
      notStarted: 1,
      empty: 2,
    });
    expect(sessions.some((row) => row.sessionId === foreignSession.id)).toBe(
      false,
    );

    // Cleanup
    await prisma.attempt.deleteMany({
      where: { id: { in: [doneAttempt.id, runningAttempt.id] } },
    });
    await prisma.sessionParticipant.deleteMany({
      where: { sessionId: statsSession.id },
    });
    await prisma.testSession.delete({ where: { id: statsSession.id } });
    await prisma.testSession.delete({ where: { id: foreignSession.id } });
    await prisma.institution.delete({ where: { id: foreignInstitution.id } });
    await prisma.user.delete({ where: { id: foreignUser.id } });
  });
});
