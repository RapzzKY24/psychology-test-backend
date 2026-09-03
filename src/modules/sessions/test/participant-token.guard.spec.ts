/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ParticipantTokenGuard } from '../guards/participant-token.guard';
import type { SessionsRepository } from '../repository/sessions.repository';
import { hashParticipantToken } from '../utils/hash-participant-token';

function makeContext(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: Request & { participant?: unknown };
} {
  const request = { headers } as unknown as Request & { participant?: unknown };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('ParticipantTokenGuard', () => {
  let guard: ParticipantTokenGuard;
  let mockRepo: jest.Mocked<
    Pick<SessionsRepository, 'findParticipantByTokenHash'>
  >;

  beforeEach(() => {
    mockRepo = { findParticipantByTokenHash: jest.fn() };
    guard = new ParticipantTokenGuard(
      mockRepo as unknown as SessionsRepository,
    );
  });

  it('should throw 401 when the x-participant-token header is missing', async () => {
    const { context } = makeContext({});
    await expect(guard.canActivate(context)).rejects.toThrow('unauthorized');
  });

  it('should throw 401 when the token does not match any participant', async () => {
    mockRepo.findParticipantByTokenHash.mockResolvedValue(null);
    const { context } = makeContext({ 'x-participant-token': 'unknown-token' });
    await expect(guard.canActivate(context)).rejects.toThrow('unauthorized');
  });

  it('should attach the participant to the request and allow access for a valid token', async () => {
    const participant = { id: 'p-1', name: 'Budi' } as any;
    mockRepo.findParticipantByTokenHash.mockResolvedValue(participant);
    const token = 'valid-participant-token';
    const { context, request } = makeContext({
      'x-participant-token': token,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockRepo.findParticipantByTokenHash).toHaveBeenCalledWith(
      hashParticipantToken(token),
    );
    expect(request.participant).toEqual(participant);
  });
});
