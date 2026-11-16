import { NotFoundException } from '@nestjs/common';
import { MeProfileService } from '../service/me-profile.service';
import type { MeProfileData } from '../repository/me-profile.repository';

const stored: MeProfileData = {
  name: 'Budi Santoso',
  email: 'budi@example.com',
  phone: '081234567890',
  lastAttempt: {
    testName: 'DISC Form A',
    startedAt: new Date('2026-11-10T09:00:00Z'),
    birthDate: new Date('2000-01-01T00:00:00Z'),
    gender: 'MALE',
    education: 'S1',
  },
};

describe('MeProfileService', () => {
  let service: MeProfileService;
  let repo: { find: jest.Mock; update: jest.Mock };

  beforeEach(() => {
    repo = { find: jest.fn(), update: jest.fn() };
    service = new MeProfileService(repo);
  });

  it('returns the stored profile', async () => {
    repo.find.mockResolvedValue(stored);

    await expect(service.get('u1')).resolves.toEqual(stored);
  });

  it('reports a missing user as not found', async () => {
    repo.find.mockResolvedValue(null);

    await expect(service.get('u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears the phone when the participant empties the field', async () => {
    repo.update.mockResolvedValue(true);
    repo.find.mockResolvedValue({ ...stored, phone: null });

    await service.update('u1', { phone: '' });

    expect(repo.update).toHaveBeenCalledWith('u1', {
      name: undefined,
      phone: null,
    });
  });

  it('updates only the name and leaves the phone untouched', async () => {
    repo.update.mockResolvedValue(true);
    repo.find.mockResolvedValue({ ...stored, name: 'Budi S.' });

    await service.update('u1', { name: 'Budi S.' });

    expect(repo.update).toHaveBeenCalledWith('u1', {
      name: 'Budi S.',
      phone: undefined,
    });
  });

  it('skips the write when the patch carries no fields', async () => {
    repo.find.mockResolvedValue(stored);

    await service.update('u1', {});

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('reports a vanished user instead of writing', async () => {
    repo.update.mockResolvedValue(false);

    await expect(
      service.update('u1', { name: 'Budi S.' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
