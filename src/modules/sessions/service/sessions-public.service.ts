import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SESSIONS_REPOSITORY } from '../repository/sessions.repository';
import type { SessionsRepository } from '../repository/sessions.repository';
import type { PublicSessionPreviewDto } from '../dto/public-session-preview.dto';

/**
 * Anonymous session preview for the guest join page. Public-safe by shape:
 * no PIN material, no participant data — only join-decision fields.
 */
@Injectable()
export class SessionsPublicService {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly repo: SessionsRepository,
  ) {}

  async getPreviewByToken(token: string): Promise<PublicSessionPreviewDto> {
    const session = await this.repo.findByToken(token);
    if (!session) throw new NotFoundException('Session not found');

    const tests = await this.repo.findSessionTestsBySessionId(session.id);
    const slotsUsed = await this.repo.countParticipants(session.id);

    return {
      title: session.title,
      status: session.status,
      expiresAt: session.expiresAt,
      tests: tests.map((test) => ({
        order: test.order,
        testName: test.testName,
      })),
      slotLimit: session.slotLimit,
      slotsUsed,
      requiresPin: Boolean(session.pinHash),
    };
  }
}
