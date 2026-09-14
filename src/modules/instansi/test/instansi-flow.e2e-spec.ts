import 'dotenv/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaSessionsRepository } from '../../sessions/repository/sessions.prisma-repository';
import { InstansiParticipantsPrismaRepository } from '../repository/instansi-participants.prisma-repository';
import { PrismaInstitutionsRepository } from '../../institutions/repository/institutions.prisma-repository';
import { PrismaTestsRepository } from '../../tests/repository/tests.prisma-repository';
import { SessionsService } from '../../sessions/service/sessions.service';
import { SessionsPublicService } from '../../sessions/service/sessions-public.service';
import { InstansiParticipantsService } from '../service/instansi-participants.service';
import { InstansiSessionsService } from '../service/instansi-sessions.service';
import { InstansiOverviewService } from '../service/instansi-overview.service';

/**
 * T3 end-to-end (real DB, real services, no HTTP):
 * register institution → add employees → create session from employees →
 * employee claims via roster picker → overview rekap reflects it.
 */
describe('Instansi flow (integration, DB real)', () => {
  let prisma: PrismaService;
  let sessionsService: InstansiSessionsService;
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
    sessionsService = new InstansiSessionsService(
      sessionsRepo,
      participantsRepo,
      testsRepo as never,
      participantsService,
      new SessionsService(sessionsRepo),
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
    await prisma.attempt.deleteMany({
      where: { participantId: { in: seatIds } },
    });
    await prisma.sessionParticipant.deleteMany({
      where: { id: { in: seatIds } },
    });
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

    // When: HR creates a session from employees
    const session = await sessionsService.create(userId, {
      title: `${tag} Sesi 1`,
      testIds: [testId],
      employeeIds: [emp1.id, emp2.id],
      slotLimit: 10,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    sessionId = session.id;
    expect(session.joinMode).toBe('ROSTER');
    expect(session.institutionId).toBe(institutionId);

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

    // Then: overview rekap reflects it
    const overview = await overviewService.getOverview(userId);
    expect(overview).toEqual({
      employees: 2,
      sessions: 1,
      attempts: { total: 1, inProgress: 1, completed: 0 },
    });
  });
});
