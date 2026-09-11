/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { ConflictException, HttpException } from '@nestjs/common';
import { RegisterInstitutionService } from '../service/register-institution.service';
import type { InstitutionsRepository } from '../repository/institutions.repository';

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
  let mockRepo: jest.Mocked<InstitutionsRepository>;

  const dto = {
    companyName: 'PT Maju Jaya',
    picName: 'Budi Santoso',
    email: 'hr@ptmajujaya.co.id',
    phone: '0215551234',
    address: 'Jl. Sudirman No. 1 Jakarta',
    password: 'rahasia123',
  };

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      promoteUserAndCreateInstitution: jest.fn(),
      deleteUserById: jest.fn(),
    };
    signUpEmail.mockReset();
    service = new RegisterInstitutionService(mockRepo);
  });

  it('creates the account (role INSTANSI) + linked institution atomically', async () => {
    signUpEmail.mockResolvedValue({
      response: { user: { id: 'u1', email: dto.email } },
      headers: { getSetCookie: () => ['session=tok'] },
    });
    mockRepo.promoteUserAndCreateInstitution.mockResolvedValue({
      user: { id: 'u1', email: dto.email, role: 'INSTANSI' },
      institution: {
        id: 'i1',
        name: dto.companyName,
        ownerUserId: 'u1',
      } as never,
    });

    const result = await service.register(dto, '1.1.1.1');

    expect(signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          name: dto.companyName,
          email: dto.email,
          password: dto.password,
        }),
      }),
    );
    expect(mockRepo.promoteUserAndCreateInstitution).toHaveBeenCalledWith({
      userId: 'u1',
      name: dto.companyName,
      contactName: dto.picName,
      contactEmail: dto.email,
      phone: dto.phone,
      address: dto.address,
    });
    expect(result.cookies).toEqual(['session=tok']);
    expect(result.user.role).toBe('INSTANSI');
    expect(result.institution.ownerUserId).toBe('u1');
    expect(mockRepo.deleteUserById).not.toHaveBeenCalled();
  });

  it('maps duplicate email to ConflictException without touching the repo', async () => {
    signUpEmail.mockImplementation(() => {
      const error = new Error('User already exists. Use another email.');
      (error as { status?: number }).status = 422;
      throw error;
    });

    await expect(service.register(dto, '1.1.1.1')).rejects.toThrow(
      ConflictException,
    );
    expect(mockRepo.promoteUserAndCreateInstitution).not.toHaveBeenCalled();
  });

  it('maps the real better-call APIError shape (status name + statusCode)', async () => {
    signUpEmail.mockImplementation(() => {
      const error = new Error('User already exists. Use another email.');
      Object.assign(error, {
        name: 'APIError',
        status: 'UNPROCESSABLE_ENTITY',
        statusCode: 422,
      });
      throw error;
    });

    await expect(service.register(dto, '1.1.1.1')).rejects.toThrow(
      'duplicate_email',
    );
    expect(mockRepo.promoteUserAndCreateInstitution).not.toHaveBeenCalled();
  });

  it('maps other duplicate shapes (409 taken) to ConflictException', async () => {
    signUpEmail.mockImplementation(() => {
      const error = new Error('Email is already taken');
      (error as { status?: number }).status = 409;
      throw error;
    });

    await expect(service.register(dto, '1.1.1.1')).rejects.toThrow(
      'duplicate_email',
    );
  });

  it('deletes the orphan user when the transaction fails', async () => {
    signUpEmail.mockResolvedValue({
      response: { user: { id: 'u1', email: dto.email } },
      headers: { getSetCookie: () => ['session=tok'] },
    });
    mockRepo.promoteUserAndCreateInstitution.mockRejectedValue(
      new Error('DB error'),
    );
    mockRepo.deleteUserById.mockResolvedValue(undefined);

    await expect(service.register(dto, '1.1.1.1')).rejects.toThrow('DB error');
    expect(mockRepo.deleteUserById).toHaveBeenCalledWith('u1');
  });

  it('still throws the original error when compensation delete fails', async () => {
    signUpEmail.mockResolvedValue({
      response: { user: { id: 'u1', email: dto.email } },
      headers: { getSetCookie: () => ['session=tok'] },
    });
    mockRepo.promoteUserAndCreateInstitution.mockRejectedValue(
      new Error('DB error'),
    );
    mockRepo.deleteUserById.mockRejectedValue(new Error('delete failed'));

    await expect(service.register(dto, '1.1.1.1')).rejects.toThrow('DB error');
  });

  it('rate-limits registration per IP (11th request → 429)', async () => {
    signUpEmail.mockResolvedValue({
      response: { user: { id: 'u1', email: dto.email } },
      headers: { getSetCookie: () => [] },
    });
    mockRepo.promoteUserAndCreateInstitution.mockResolvedValue({
      user: { id: 'u1', email: dto.email, role: 'INSTANSI' },
      institution: {
        id: 'i1',
        name: dto.companyName,
        ownerUserId: 'u1',
      } as never,
    });

    for (let i = 0; i < 10; i++) {
      await service.register(dto, '9.9.9.9');
    }
    await expect(service.register(dto, '9.9.9.9')).rejects.toThrow(
      HttpException,
    );
    expect(signUpEmail).toHaveBeenCalledTimes(10);
  });
});
