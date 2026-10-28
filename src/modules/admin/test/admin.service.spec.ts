import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { AdminService } from '../service/admin.service';
import { ADMIN_REPOSITORY } from '../repository/admin.repository';
import type { AdminRepository } from '../repository/admin.repository';

jest.mock('better-auth/crypto', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
}));

const userRow = {
  id: 'user-1',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

/** Plain jest mocks — `jest.Mocked<T>` keeps the interface methods, which the
 *  `unbound-method` lint rule rejects when they are passed to `expect`. */
type MockedRepo = { [K in keyof AdminRepository]: jest.Mock };

function buildRepo(): MockedRepo {
  return {
    findUsers: jest.fn(),
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
    findProfileByNik: jest.fn(),
    createUserWithAccount: jest.fn(),
    createPsychologistWithAccount: jest.fn(),
    updateUserRole: jest.fn(),
  };
}

describe('AdminService', () => {
  let service: AdminService;
  let repo: MockedRepo;

  beforeEach(async () => {
    repo = buildRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: ADMIN_REPOSITORY, useValue: repo }],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  describe('listUsers', () => {
    it('passes the page window to the repository and returns pagination meta', async () => {
      repo.findUsers.mockResolvedValue({ data: [userRow], total: 42 });

      const result = await service.listUsers({ page: 2, limit: 10 });

      expect(repo.findUsers).toHaveBeenCalledWith({
        role: undefined,
        skip: 10,
        take: 10,
      });
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 42,
        totalPages: 5,
      });
      expect(result.data).toEqual([userRow]);
    });

    it('forwards the role filter', async () => {
      repo.findUsers.mockResolvedValue({ data: [], total: 0 });

      await service.listUsers({ page: 1, limit: 10, role: 'PSYCHOLOGIST' });

      expect(repo.findUsers).toHaveBeenCalledWith({
        role: 'PSYCHOLOGIST',
        skip: 0,
        take: 10,
      });
    });
  });

  describe('createUser', () => {
    it('rejects an email that is already registered', async () => {
      repo.findUserByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createUser({
          name: 'New Admin',
          email: 'admin@example.com',
          password: 'rahasia123',
          role: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.createUserWithAccount).not.toHaveBeenCalled();
    });

    it('creates the user with a hashed password', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.createUserWithAccount.mockResolvedValue(userRow);

      const result = await service.createUser({
        name: 'New Admin',
        email: 'admin@example.com',
        password: 'rahasia123',
        role: 'ADMIN',
      });

      expect(repo.createUserWithAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Admin',
          email: 'admin@example.com',
          role: 'ADMIN',
          passwordHash: 'hashed-password',
        }),
      );
      expect(result).toEqual(userRow);
    });
  });

  describe('createPsychologist', () => {
    const dto = {
      name: 'Dr. Test',
      nik: '3273010101990001',
      institutionName: 'Klinik Test',
      email: 'psy@example.com',
      password: 'rahasia123',
    };

    it('rejects a duplicate email', async () => {
      repo.findUserByEmail.mockResolvedValue({ id: 'existing' });

      await expect(service.createPsychologist(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.createPsychologistWithAccount).not.toHaveBeenCalled();
    });

    it('rejects a duplicate NIK', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.findProfileByNik.mockResolvedValue({ id: 'profile-1' });

      await expect(service.createPsychologist(dto)).rejects.toThrow(
        'duplicate_nik',
      );
      expect(repo.createPsychologistWithAccount).not.toHaveBeenCalled();
    });

    it('returns the created user and profile', async () => {
      const profile = { id: 'profile-1', userId: 'user-1' };
      repo.findUserByEmail.mockResolvedValue(null);
      repo.findProfileByNik.mockResolvedValue(null);
      repo.createPsychologistWithAccount.mockResolvedValue({
        user: { ...userRow, role: 'PSYCHOLOGIST' },
        profile: profile as never,
      });

      const result = await service.createPsychologist(dto);

      expect(result.profile).toEqual(profile);
      expect(repo.createPsychologistWithAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          nik: dto.nik,
          institutionName: dto.institutionName,
          passwordHash: 'hashed-password',
        }),
      );
    });

    it('maps a concurrent NIK collision (P2002) to 409 instead of 500', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.findProfileByNik.mockResolvedValue(null);
      repo.createPsychologistWithAccount.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['psychologist_profiles_nik_key'] },
        }),
      );

      await expect(service.createPsychologist(dto)).rejects.toThrow(
        'duplicate_nik',
      );
    });

    it('maps a concurrent email collision (P2002) to 409 instead of 500', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.findProfileByNik.mockResolvedValue(null);
      repo.createPsychologistWithAccount.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        }),
      );

      await expect(service.createPsychologist(dto)).rejects.toThrow(
        'duplicate_email',
      );
    });
  });

  describe('updateRole', () => {
    it('refuses to change the caller own role', async () => {
      await expect(
        service.updateRole('user-1', 'ADMIN', 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.updateUserRole).not.toHaveBeenCalled();
    });

    it('throws when the target user does not exist', async () => {
      repo.findUserById.mockResolvedValue(null);

      await expect(
        service.updateRole('missing', 'ADMIN', 'caller'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the role of another user', async () => {
      repo.findUserById.mockResolvedValue({ id: 'user-2' });
      repo.updateUserRole.mockResolvedValue({ ...userRow, id: 'user-2' });

      const result = await service.updateRole(
        'user-2',
        'PSYCHOLOGIST',
        'caller',
      );

      expect(repo.updateUserRole).toHaveBeenCalledWith(
        'user-2',
        'PSYCHOLOGIST',
      );
      expect(result.id).toBe('user-2');
    });
  });
});
