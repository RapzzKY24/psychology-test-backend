import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SESSIONS_REPOSITORY } from '../../sessions/repository/sessions.repository';
import type {
  SessionsRepository,
  SessionDetail,
} from '../../sessions/repository/sessions.repository';
import { SessionsService } from '../../sessions/service/sessions.service';
import { TESTS_REPOSITORY } from '../../tests/repository/tests.repository';
import type { TestsRepository } from '../../tests/repository/tests.repository';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from '../repository/instansi-participants.repository';
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';
import { InstansiParticipantsService } from './instansi-participants.service';
import { InvoicesService } from '../../invoices/service/invoices.service';
import type { CreateInstansiSessionDto } from '../dto/create-instansi-session.dto';
import type { AddBatchParticipantsDto } from '../dto/add-batch-participants.dto';
import type { SwapBatchParticipantDto } from '../dto/swap-batch-participant.dto';
import {
  toInstansiInvoice,
  type InstansiInvoiceDto,
} from '../dto/instansi-invoice.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type { Invoice, TestSession } from '../../../generated/prisma/client';

export interface InstansiBatchCreateResult {
  session: TestSession;
  invoice: InstansiInvoiceDto;
}

/**
 * Institution-owned test sessions. Institution is always derived from the
 * caller (ownerUserId) — never from the request body. Session creation
 * itself is delegated to SessionsService (single implementation).
 */
@Injectable()
export class InstansiSessionsService {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepo: SessionsRepository,
    @Inject(INSTANSI_PARTICIPANTS_REPOSITORY)
    private readonly participantsRepo: InstansiParticipantsRepository,
    @Inject(TESTS_REPOSITORY)
    private readonly testsRepo: TestsRepository,
    private readonly participantsService: InstansiParticipantsService,
    private readonly sessionsService: SessionsService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async create(
    userId: string,
    dto: CreateInstansiSessionDto,
  ): Promise<InstansiBatchCreateResult> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);

    // WPT hidden from instansi — only CPMI (and existing non-WPT tests) allowed
    const tests = await this.testsRepo.findMany({
      skip: 0,
      take: dto.testIds.length,
      where: { id: { in: dto.testIds } },
    });
    const wptTests = tests.data.filter((t) => t.slug === 'wpt');
    if (wptTests.length > 0) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [`instansi cannot use WPT directly, use CPMI`],
      });
    }

    if (dto.employeeIds.length > dto.slotLimit) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [
          `employeeIds: ${dto.employeeIds.length} employees exceed slotLimit ${dto.slotLimit}`,
        ],
      });
    }

    const employees = await this.participantsRepo.findManyByIds(
      institutionId,
      dto.employeeIds,
    );
    if (employees.length !== dto.employeeIds.length) {
      throw new NotFoundException('Employee not found');
    }
    const byId = new Map(employees.map((e) => [e.id, e]));

    const session = await this.sessionsService.create(
      {
        title: dto.title,
        institutionId,
        testIds: dto.testIds,
        slotLimit: dto.slotLimit,
        expiresAt: dto.expiresAt,
        status: 'PENDING_PAYMENT',
        pin: dto.pin,
        roster: dto.employeeIds.map((id) => {
          const employee = byId.get(id);
          if (!employee) throw new NotFoundException('Employee not found');
          return {
            name: employee.name,
            institutionParticipantId: employee.id,
          };
        }),
      },
      userId,
    );

    // One seat per employee, each seat pays the sum of the batch's test prices.
    const pricePerSeat = tests.data.reduce((sum, t) => sum + t.price, 0);
    const invoice = await this.invoicesService.createForSession({
      institutionId,
      amount: pricePerSeat * employees.length,
      sessionId: session.id,
      expiresAt: session.expiresAt,
    });

    return { session, invoice: toInstansiInvoice(invoice) };
  }

  async list(
    userId: string,
    pagination: { page: number; limit: number },
  ): Promise<PaginatedResponse<TestSession>> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const skip = (pagination.page - 1) * pagination.limit;
    const { data, total } = await this.sessionsRepo.findManyByInstitution(
      institutionId,
      { skip, take: pagination.limit },
    );
    return {
      data,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getDetail(userId: string, sessionId: string): Promise<SessionDetail> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const detail = await this.sessionsRepo.findDetailById(sessionId);
    if (!detail || detail.session.institutionId !== institutionId) {
      throw new NotFoundException('Session not found');
    }
    return detail;
  }

  async close(userId: string, sessionId: string): Promise<TestSession> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session || session.institutionId !== institutionId) {
      throw new NotFoundException('Session not found');
    }
    return this.sessionsService.close(sessionId);
  }

  async addParticipants(
    userId: string,
    sessionId: string,
    dto: AddBatchParticipantsDto,
  ): Promise<InstansiInvoiceDto> {
    const { session, invoice, pricePerSeat } = await this.loadEditableBatch(
      userId,
      sessionId,
    );
    const institutionId = session.institutionId;
    if (!institutionId) throw new NotFoundException('Session not found');

    const existing = await this.sessionsRepo.findParticipantsBySessionId(
      session.id,
    );
    if (existing.length + dto.employeeIds.length > session.slotLimit) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [
          `employeeIds: ${existing.length + dto.employeeIds.length} exceed slotLimit ${session.slotLimit}`,
        ],
      });
    }
    const linked = new Set(
      existing.map((p) => p.institutionParticipantId).filter(Boolean),
    );
    if (dto.employeeIds.some((id) => linked.has(id))) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ['employeeIds: already linked to this batch'],
      });
    }

    const employees = await this.participantsRepo.findManyByIds(
      institutionId,
      dto.employeeIds,
    );
    if (employees.length !== dto.employeeIds.length) {
      throw new NotFoundException('Employee not found');
    }

    await this.sessionsRepo.createParticipants(
      session.id,
      employees.map((e) => ({
        name: e.name,
        institutionParticipantId: e.id,
      })),
    );
    const updated = await this.invoicesService.regenerateAmount(
      invoice.id,
      pricePerSeat * (existing.length + employees.length),
    );
    return toInstansiInvoice(updated);
  }

  async swapParticipant(
    userId: string,
    sessionId: string,
    participantId: string,
    dto: SwapBatchParticipantDto,
  ): Promise<InstansiInvoiceDto> {
    const { session, invoice } = await this.loadEditableBatch(
      userId,
      sessionId,
    );
    const institutionId = session.institutionId;
    if (!institutionId) throw new NotFoundException('Session not found');

    const participants = await this.sessionsRepo.findParticipantsBySessionId(
      session.id,
    );
    if (!participants.some((p) => p.id === participantId)) {
      throw new NotFoundException('Participant not found');
    }
    if (
      participants.some(
        (p) =>
          p.id !== participantId &&
          p.institutionParticipantId === dto.employeeId,
      )
    ) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ['employeeId: already linked to this batch'],
      });
    }

    const [employee] = await this.participantsRepo.findManyByIds(
      institutionId,
      [dto.employeeId],
    );
    if (!employee) throw new NotFoundException('Employee not found');

    await this.sessionsRepo.updateParticipant(participantId, {
      name: employee.name,
      institutionParticipantId: employee.id,
    });
    return toInstansiInvoice(invoice);
  }

  async removeParticipant(
    userId: string,
    sessionId: string,
    participantId: string,
  ): Promise<InstansiInvoiceDto> {
    const { session, invoice, pricePerSeat } = await this.loadEditableBatch(
      userId,
      sessionId,
    );
    const participants = await this.sessionsRepo.findParticipantsBySessionId(
      session.id,
    );
    if (!participants.some((p) => p.id === participantId)) {
      throw new NotFoundException('Participant not found');
    }

    await this.sessionsRepo.deleteParticipant(participantId);
    const updated = await this.invoicesService.regenerateAmount(
      invoice.id,
      pricePerSeat * (participants.length - 1),
    );
    return toInstansiInvoice(updated);
  }

  /**
   * The batch must belong to the caller's institution and its invoice must
   * still be UNPAID — once paid the roster is frozen (`batch_locked`).
   */
  private async loadEditableBatch(
    userId: string,
    sessionId: string,
  ): Promise<{ session: TestSession; invoice: Invoice; pricePerSeat: number }> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session || session.institutionId !== institutionId) {
      throw new NotFoundException('Session not found');
    }
    const invoice = await this.invoicesService.findBySessionId(session.id);
    if (!invoice || invoice.status !== 'UNPAID') {
      throw new ConflictException('batch_locked');
    }

    const sessionTests = await this.sessionsRepo.findSessionTestsBySessionId(
      session.id,
    );
    const tests = await this.testsRepo.findMany({
      skip: 0,
      take: sessionTests.length,
      where: { id: { in: sessionTests.map((st) => st.testId) } },
    });
    const pricePerSeat = tests.data.reduce((sum, t) => sum + t.price, 0);
    return { session, invoice, pricePerSeat };
  }
}
