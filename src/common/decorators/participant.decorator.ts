import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionParticipant } from '../../generated/prisma/client';

/**
 * Injects the SessionParticipant resolved by ParticipantTokenGuard from the
 * x-participant-token header (ADR-005, docs/features/04 FR#6).
 */
export const Participant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionParticipant | undefined => {
    const request = ctx.switchToHttp().getRequest<{
      participant?: SessionParticipant;
    }>();
    return request.participant;
  },
);
