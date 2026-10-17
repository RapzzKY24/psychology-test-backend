import {
  Injectable,
  Inject,
  NotFoundException,
  GoneException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SESSIONS_REPOSITORY } from '../repository/sessions.repository';
import type { SessionsRepository } from '../repository/sessions.repository';
import type { PublicSessionPreviewDto } from '../dto/public-session-preview.dto';
import { createRateLimiter } from '../../../common/utils/in-memory-rate-limiter';
import { generateParticipantToken } from '../utils/generate-participant-token';

const CLAIM_RATE_LIMIT = 30;
const CLAIM_RATE_WINDOW_MS = 60_000;
import { hashParticipantToken } from '../utils/hash-participant-token';

/**
 * Anonymous session preview for the guest join page. Public-safe by shape:
 * no PIN material, no participant data — only join-decision fields.
 */
@Injectable()
export class SessionsPublicService {
  private readonly claimLimiter = createRateLimiter(
    CLAIM_RATE_LIMIT,
    CLAIM_RATE_WINDOW_MS,
  );

  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly repo: SessionsRepository,
  ) {}

  async getPreviewByToken(token: string): Promise<PublicSessionPreviewDto> {
    const session = await this.repo.findByToken(token);
    if (!session) throw new NotFoundException('Session not found');

    const tests = await this.repo.findSessionTestsBySessionId(session.id);
    const participants = await this.repo.findParticipantsBySessionId(
      session.id,
    );

    return {
      sessionId: session.id,
      title: session.title,
      status: session.status,
      active: session.status === 'ACTIVE',
      expiresAt: session.expiresAt,
      tests: tests.map((test) => ({
        order: test.order,
        testName: test.testName,
      })),
      slotLimit: session.slotLimit,
      slotsUsed: participants.length,
      requiresPin: Boolean(session.pinHash),
      joinMode: session.joinMode,
      roster:
        session.joinMode === 'ROSTER'
          ? participants.map((p) => ({
              id: p.id,
              name: p.name,
              candidateNumber: p.candidateNumber,
              claimed: p.tokenHash != null,
            }))
          : undefined,
    };
  }

  /**
   * Roster claim: issues (re-issues) the participant token for a pre-created
   * roster row. Idempotent by construction — claiming always returns a working
   * token for that row, so a kid can resume from any device.
   */
  async claim(
    token: string,
    participantId: string,
    ip: string,
  ): Promise<{
    participant: {
      id: string;
      sessionId: string;
      name: string;
      email: string | null;
      phone: string | null;
      candidateNumber: string | null;
      claimedAt: Date | null;
      joinedAt: Date;
    };
    participantToken: string;
    attempts: { id: string; testId: string; testName: string }[];
    resumed: boolean;
  }> {
    this.claimLimiter.check(ip);

    const session = await this.repo.findByToken(token);
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'CLOSED') {
      throw new NotFoundException('Session not found');
    }
    if (session.status === 'PENDING_PAYMENT') {
      throw new ForbiddenException('session_unpaid');
    }
    if (session.joinMode !== 'ROSTER') {
      throw new NotFoundException('Session not found');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('session_expired');
    }

    const participants = await this.repo.findParticipantsBySessionId(
      session.id,
    );
    const match = participants.find((p) => p.id === participantId);
    if (!match) throw new NotFoundException('Participant not found');

    const participantToken = generateParticipantToken();
    const tokenHash = hashParticipantToken(participantToken);
    const claimedAt = match.claimedAt ?? new Date();
    // Atomic: win the seat only if still unlocked, persist token + claimedAt,
    // and create one IN_PROGRESS attempt per session test when the seat has none.
    const sessionTests = await this.repo.findSessionTestsBySessionId(
      session.id,
    );
    const won = await this.repo.claimSeatWithAttempts({
      seatId: match.id,
      tokenHash,
      claimedAt,
      sessionId: session.id,
      testIds: sessionTests.map((st) => st.testId),
    });
    if (!won) throw new ConflictException('seat_claimed');

    const attempts = await this.repo.findAttemptsByParticipantId(match.id);
    const participant = {
      id: match.id,
      sessionId: match.sessionId,
      name: match.name,
      email: match.email,
      phone: match.phone,
      candidateNumber: match.candidateNumber,
      claimedAt,
      joinedAt: match.joinedAt,
    };
    return { participant, participantToken, attempts, resumed: true };
  }
}
