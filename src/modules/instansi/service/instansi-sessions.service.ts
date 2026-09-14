import {
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
import type { CreateInstansiSessionDto } from '../dto/create-instansi-session.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type { TestSession } from '../../../generated/prisma/client';

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
  ) {}

  async create(
    userId: string,
    dto: CreateInstansiSessionDto,
  ): Promise<TestSession> {
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

    return this.sessionsService.create(
      {
        title: dto.title,
        institutionId,
        testIds: dto.testIds,
        slotLimit: dto.slotLimit,
        expiresAt: dto.expiresAt,
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
}
