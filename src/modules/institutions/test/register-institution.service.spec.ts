import { ConflictException } from '@nestjs/common';
import { RegisterInstitutionService } from '../service/register-institution.service';
import type { PrismaService } from '../../../prisma/prisma.service';

jest.mock('../../auth/auth', () => ({
  auth: {
    api: {
      signUpEmail: jest.fn(),
    },
  },
}));

import { auth } from '../../auth/auth';

const signUpEmail = auth.api.signUpEmail as unknown as jest.Mock;

describe('RegisterInstitutionService', () => {
  let service: RegisterInstitutionService;
  let mockPrisma: {
    user: { update: jest.Mock };
    institution: { create: jest.Mock };
  };

  const dto = {
    companyName: 'PT Maju Jaya',
    picName: 'Budi Santoso',
    email: 'hr@ptmajujaya.co.id',
    phone: '0215551234',
    address: 'Jl. Sudirman No. 1 Jakarta',
    password: 'rahasia123',
  };

  beforeEach(() => {
    mockPrisma = {
      user: { update: jest.fn() },
      institution: { create: jest.fn() },
    };
    signUpEmail.mockReset();
    service = new RegisterInstitutionService(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('creates the account (role INSTANSI) + linked institution', async () => {
    signUpEmail.mockResolvedValue({
      response: { token: 'tok', user: { id: 'u1', email: dto.email } },
      headers: new Headers(),
    });
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'INSTANSI' });
    mockPrisma.institution.create.mockResolvedValue({
      id: 'i1',
      name: dto.companyName,
      ownerUserId: 'u1',
    });

    const result = await service.register(dto);

    expect(signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.objectContaining({
          name: dto.companyName,
          email: dto.email,
          password: dto.password,
        }),
      }),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'INSTANSI' },
    });
    expect(mockPrisma.institution.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        name: dto.companyName,
        ownerUserId: 'u1',
      }),
    });
    expect(result.user.role).toBe('INSTANSI');
    expect(result.institution.ownerUserId).toBe('u1');
  });

  it('maps better-auth duplicate email to ConflictException', async () => {
    signUpEmail.mockImplementation(() => {
      const error = new Error('User already exists. Use another email.');
      (error as { status?: number }).status = 422;
      throw error;
    });

    await expect(service.register(dto)).rejects.toThrow(ConflictException);
    expect(mockPrisma.institution.create).not.toHaveBeenCalled();
  });
});
