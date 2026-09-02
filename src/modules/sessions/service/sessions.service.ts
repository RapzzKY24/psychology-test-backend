import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SESSIONS_REPOSITORY } from '../repository/sessions.repository';
import type {
  SessionsRepository,
  SessionDetail,
} from '../repository/sessions.repository';
import type { CreateSessionDto } from '../dto/create-session.dto';
import type { TestSession } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import { generateInviteToken } from '../utils/generate-invite-token';
import { hashPin } from '../utils/hash-pin';

const TOKEN_MAX_ATTEMPTS = 5;

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly repo: SessionsRepository,
  ) {}

  async create(
    dto: CreateSessionDto,
    createdById: string,
  ): Promise<TestSession> {
    if (dto.institutionId) {
      const institution = await this.repo.findInstitutionById(
        dto.institutionId,
      );
      if (!institution) {
        throw new UnprocessableEntityException({
          message: 'validation_failed',
          details: ['institutionId: Institution not found'],
        });
      }
    }

    const tests = await this.repo.findTestsByIds(dto.testIds);
    const notPublished = dto.testIds.filter((id) => {
      const test = tests.find((t) => t.id === id);
      return !test || test.status !== 'PUBLISHED';
    });
    if (notPublished.length > 0) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [
          `testIds: missing or not PUBLISHED: ${notPublished.join(', ')}`,
        ],
      });
    }

    // Token collision retry (unique constraint on token) — D3-adjacent safety.
    let token = '';
    for (let attempt = 0; attempt < TOKEN_MAX_ATTEMPTS; attempt++) {
      token = generateInviteToken();
      const existing = await this.repo.findByToken(token);
      if (!existing) break;
      if (attempt === TOKEN_MAX_ATTEMPTS - 1) {
        throw new UnprocessableEntityException({
          message: 'validation_failed',
          details: ['token: could not generate a unique invite token'],
        });
      }
    }

    const pinHash = dto.pin ? await hashPin(dto.pin) : undefined;

    return this.repo.createWithTests({
      kind: 'GROUP', // group sessions here; INDIVIDUAL sessions arrive with payments (feature 07)
      title: dto.title,
      institutionId: dto.institutionId,
      createdById,
      token,
      pinHash,
      slotLimit: dto.slotLimit,
      expiresAt: dto.expiresAt,
      tests: dto.testIds.map((testId, index) => ({
        testId,
        order: index + 1,
      })),
    });
  }

  async findDetail(id: string): Promise<SessionDetail> {
    const detail = await this.repo.findDetailById(id);
    if (!detail) throw new NotFoundException('Session not found');
    return detail;
  }

  async findMany(query: {
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<TestSession>> {
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findMany({
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

  async close(id: string): Promise<TestSession> {
    const session = await this.repo.findById(id);
    if (!session) throw new NotFoundException('Session not found');
    // Idempotent close — mirrors the idempotent-complete pattern in this feature.
    if (session.status === 'CLOSED') return session;
    return this.repo.updateStatus(id, 'CLOSED');
  }
}
