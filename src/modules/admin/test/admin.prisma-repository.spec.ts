/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { PrismaAdminRepository } from '../repository/admin.prisma-repository';

describe('PrismaAdminRepository', () => {
  let repo: PrismaAdminRepository;
  let mockPrisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    account: { create: jest.Mock };
    psychologistProfile: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  const psychologistInput = {
    userId: 'u1',
    name: 'Dr. Sinta',
    nik: '3201010101010001',
    institutionName: 'RS Harapan',
    email: 'sinta@example.com',
    passwordHash: 'hashed-test-password',
  };

  beforeEach(() => {
    mockPrisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      account: { create: jest.fn() },
      psychologistProfile: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    repo = new PrismaAdminRepository(mockPrisma as never);
  });

  describe('createPsychologistWithAccount', () => {
    it('creates user + account + profile in one transaction', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'u1',
        role: 'PSYCHOLOGIST',
      });
      mockPrisma.psychologistProfile.create.mockResolvedValue({ id: 'p1' });

      const result =
        await repo.createPsychologistWithAccount(psychologistInput);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: psychologistInput.email,
            role: 'PSYCHOLOGIST',
            emailVerified: true,
          }),
        }),
      );
      expect(mockPrisma.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            providerId: 'credential',
            password: 'hashed-test-password',
          }),
        }),
      );
      expect(mockPrisma.psychologistProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nik: psychologistInput.nik,
            institutionName: psychologistInput.institutionName,
          }),
        }),
      );
      expect(result.user).toEqual({ id: 'u1', role: 'PSYCHOLOGIST' });
      expect(result.profile).toEqual({ id: 'p1' });
    });
  });

  describe('createUserWithAccount', () => {
    it('creates the user and its credential account atomically', async () => {
      mockPrisma.user.create.mockResolvedValue({ id: 'u2', role: 'ADMIN' });

      const result = await repo.createUserWithAccount({
        userId: 'u2',
        name: 'Admin',
        email: 'admin@example.com',
        role: 'ADMIN',
        passwordHash: 'hashed-test-password',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'u2',
            userId: 'u2',
            password: 'hashed-test-password',
          }),
        }),
      );
      expect(result).toEqual({ id: 'u2', role: 'ADMIN' });
    });
  });
});
