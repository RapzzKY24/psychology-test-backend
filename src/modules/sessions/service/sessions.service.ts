import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { SESSIONS_REPOSITORY } from '../repository/sessions.repository';
import type {
  SessionsRepository,
  SessionDetail,
  JoinSessionResult,
} from '../repository/sessions.repository';
import type { CreateSessionDto } from '../dto/create-session.dto';
import type { JoinSessionDto } from '../dto/join-session.dto';
import type { TestSession } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import { generateInviteToken } from '../utils/generate-invite-token';
import { hashPin } from '../utils/hash-pin';
import { verifyPin } from '../utils/verify-pin';
import { generateParticipantToken } from '../utils/generate-participant-token';
import { hashParticipantToken } from '../utils/hash-participant-token';
import { createRateLimiter } from '../../../common/utils/in-memory-rate-limiter';

const TOKEN_MAX_ATTEMPTS = 5;
// docs/features/04-sessions-attempts.md NFR — 10/min/IP, Redis swap later.
const JOIN_RATE_LIMIT = 10;
const JOIN_RATE_WINDOW_MS = 60_000;

@Injectable()
export class SessionsService {
  private readonly joinLimiter = createRateLimiter(
    JOIN_RATE_LIMIT,
    JOIN_RATE_WINDOW_MS,
  );

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

    // Token collision retry — handles both pre-check and concurrent P2002
    const pinHash = dto.pin ? await hashPin(dto.pin) : undefined;
    for (let attempt = 0; attempt < TOKEN_MAX_ATTEMPTS; attempt++) {
      const token = generateInviteToken();
      const existing = await this.repo.findByToken(token);
      if (existing) continue;
      try {
        return await this.repo.createWithTests({
          kind: 'GROUP',
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
      } catch (error) {
        const isUnique =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (isUnique) continue;
        throw error;
      }
    }
    throw new UnprocessableEntityException({
      message: 'validation_failed',
      details: ['token: could not generate a unique invite token'],
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

  async join(
    token: string,
    dto: JoinSessionDto,
    ip: string,
  ): Promise<JoinSessionResult> {
    // Rate limit first — protects the PIN check from brute force.
    this.joinLimiter.check(ip);

    // Validation order is documented in FR#5 — do not reorder.
    const session = await this.repo.findByToken(token);
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'CLOSED') {
      throw new GoneException('session_closed');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('session_expired');
    }

    // Idempotent identity join (owner decision 2026-09-06): same person in the
    // same session resumes their participant + attempts with a re-issued token
    // instead of creating a duplicate and burning another slot. Precedence:
    // email → candidateNumber → exact name.
    const sessionParticipants = await this.repo.findParticipantsBySessionId(
      session.id,
    );
    const existing = sessionParticipants.find((p) =>
      dto.email
        ? p.email?.toLowerCase() === dto.email.toLowerCase()
        : dto.candidateNumber
          ? p.candidateNumber === dto.candidateNumber
          : p.name.toLowerCase() === dto.name.toLowerCase(),
    );
    if (existing) {
      const participantToken = generateParticipantToken();
      const tokenHash = hashParticipantToken(participantToken);
      await this.repo.updateParticipantToken(existing.id, tokenHash);
      const attempts = await this.repo.findAttemptsByParticipantId(existing.id);
      // Explicit shape — mirrors joinSession (tokenHash never leaves the server).
      const participant = {
        id: existing.id,
        sessionId: existing.sessionId,
        name: existing.name,
        email: existing.email,
        candidateNumber: existing.candidateNumber,
        joinedAt: existing.joinedAt,
      };
      return { participant, participantToken, attempts, resumed: true };
    }
    const sessionTests = await this.repo.findSessionTestsBySessionId(
      session.id,
    );
    const notPublished = sessionTests.filter(
      (st) => st.testStatus !== 'PUBLISHED',
    );
    if (notPublished.length > 0) {
      throw new GoneException('test_archived');
    }
    if (session.pinHash) {
      const pinOk = dto.pin ? await verifyPin(dto.pin, session.pinHash) : false;
      if (!pinOk) throw new UnauthorizedException('invalid_pin');
    }

    const participantToken = generateParticipantToken();
    const tokenHash = hashParticipantToken(participantToken);

    const result = await this.repo.joinSession({
      sessionId: session.id,
      name: dto.name,
      email: dto.email,
      candidateNumber: dto.candidateNumber,
      participantToken,
      tokenHash,
    });
    return { ...result, resumed: false };
  }
}
