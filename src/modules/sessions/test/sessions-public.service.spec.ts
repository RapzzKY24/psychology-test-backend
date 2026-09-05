import { NotFoundException } from '@nestjs/common';
import { SessionsPublicService } from '../service/sessions-public.service';
import type { SessionsRepository } from '../repository/sessions.repository';

describe('SessionsPublicService', () => {
  let service: SessionsPublicService;
  let mockRepo: jest.Mocked<
    Pick<
      SessionsRepository,
      'findByToken' | 'findSessionTestsBySessionId' | 'countParticipants'
    >
  >;

  beforeEach(() => {
    mockRepo = {
      findByToken: jest.fn(),
      findSessionTestsBySessionId: jest.fn(),
      countParticipants: jest.fn(),
    };
    service = new SessionsPublicService(
      mockRepo as unknown as SessionsRepository,
    );
  });

  it('returns a public-safe preview for a known token', async () => {
    mockRepo.findByToken.mockResolvedValue({
      id: 's1',
      title: 'Rekrutmen Batch Sep',
      status: 'ACTIVE',
      expiresAt: new Date('2026-09-10T00:00:00Z'),
      slotLimit: 20,
      pinHash: 'hashed',
    } as never);
    mockRepo.findSessionTestsBySessionId.mockResolvedValue([
      {
        testId: 't1',
        testName: 'DISC Form A',
        testStatus: 'PUBLISHED',
        order: 1,
      },
    ]);
    mockRepo.countParticipants.mockResolvedValue(8);

    const preview = await service.getPreviewByToken('token-abc');

    expect(preview.title).toBe('Rekrutmen Batch Sep');
    expect(preview.tests).toEqual([{ order: 1, testName: 'DISC Form A' }]);
    expect(preview.slotsUsed).toBe(8);
    expect(preview.requiresPin).toBe(true);
  });

  it('throws NotFound for an unknown token (no session detail leak)', async () => {
    mockRepo.findByToken.mockResolvedValue(null);
    await expect(service.getPreviewByToken('nope')).rejects.toThrow(
      NotFoundException,
    );
  });
});
