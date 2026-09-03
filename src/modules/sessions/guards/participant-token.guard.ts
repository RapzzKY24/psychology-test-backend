import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Injectable,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { SESSIONS_REPOSITORY } from '../repository/sessions.repository';
import type { SessionsRepository } from '../repository/sessions.repository';
import type { SessionParticipant } from '../../../generated/prisma/client';
import { hashParticipantToken } from '../utils/hash-participant-token';

/**
 * Resolves the guest identity from the `x-participant-token` header (ADR-005)
 * and attaches the SessionParticipant to `request.participant`.
 * This is NOT a session AuthGuard — public routes still declare @AllowAnonymous()
 * to skip the better-auth AuthGuard (docs/features/04-sessions-attempts.md FR#6).
 */
@Injectable()
export class ParticipantTokenGuard implements CanActivate {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly repo: SessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { participant?: SessionParticipant }>();
    const header = request.headers['x-participant-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) throw new UnauthorizedException('unauthorized');

    const participant = await this.repo.findParticipantByTokenHash(
      hashParticipantToken(token),
    );
    if (!participant) throw new UnauthorizedException('unauthorized');

    request.participant = participant;
    return true;
  }
}
