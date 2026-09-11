/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { ConflictException } from '@nestjs/common';

// better-auth/crypto is ESM-only; mock before the service import.
jest.mock('better-auth/crypto', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed-test-password'),
}));
import { AdminService } from '../service/admin.service';

describe('AdminService.createPsychologist', () => {
  let service: AdminService;
  let mockPrisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    account: { create: jest.Mock };
    psychologistProfile: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  const dto = {
    name: 'Dr. Sinta',
    nik: '3201010101010001',
    institutionName: 'RS Harapan',
    email: 'sinta@example.com',
    password: 'rahasia123',
  };

  beforeEach(() => {
    mockPrisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      account: { create: jest.fn() },
      psychologistProfile: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    service = new AdminService(mockPrisma as never);
  });

  it('should create user + account + profile in one transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.psychologistProfile.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'u1',
      role: 'PSYCHOLOGIST',
    });
    mockPrisma.psychologistProfile.create.mockResolvedValue({ id: 'p1' });

    const result = await service.createPsychologist(dto);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: dto.email,
          role: 'PSYCHOLOGIST',
          emailVerified: true,
        }),
      }),
    );
    expect(mockPrisma.account.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.psychologistProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nik: dto.nik,
          institutionName: dto.institutionName,
        }),
      }),
    );
    expect(result.user).toEqual({ id: 'u1', role: 'PSYCHOLOGIST' });
  });

  it('should throw 409 when email is taken', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'other' });

    await expect(service.createPsychologist(dto)).rejects.toThrow(
      ConflictException,
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should throw 409 when NIK is taken', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.psychologistProfile.findUnique.mockResolvedValue({ id: 'p9' });

    await expect(service.createPsychologist(dto)).rejects.toThrow(
      ConflictException,
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
