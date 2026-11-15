/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '../../../generated/prisma/client';
import { UpdateProfileSchema } from '../dto/update-profile.dto';
import { PsychologistService } from '../service/psychologist.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

describe('PsychologistService.updateProfile', () => {
  let service: PsychologistService;
  let mockRepo: {
    findByUserId: jest.Mock;
    findSigners: jest.Mock;
    upsert: jest.Mock;
    updateSignature: jest.Mock;
  };
  let mockConfig: { get: jest.Mock };

  const dto = {
    fullName: 'Dr. Ayu Lestari, M.Psi.',
    degree: 'Psikolog',
    licenseNumber: 'SIPP-123',
    nik: '3201010101010001',
    institutionName: 'RS Harapan',
  };

  beforeEach(() => {
    mockRepo = {
      findByUserId: jest.fn(),
      findSigners: jest.fn(),
      upsert: jest.fn(),
      updateSignature: jest.fn(),
    };
    mockConfig = { get: jest.fn().mockReturnValue('./uploads') };
    service = new PsychologistService(mockRepo, mockConfig as never);
  });

  it('should pass all five fields to repo.upsert', async () => {
    mockRepo.upsert.mockResolvedValue({ id: 'p1', ...dto });

    const result = await service.updateProfile('u1', dto);

    expect(mockRepo.upsert).toHaveBeenCalledWith('u1', dto);
    expect(result).toEqual({ id: 'p1', ...dto });
  });

  it('should accept an empty degree (single-field name without comma)', () => {
    const parsed = UpdateProfileSchema.safeParse({ ...dto, degree: '' });

    expect(parsed.success).toBe(true);
  });

  it('should map a NIK collision (P2002) to 409 duplicate_nik', async () => {
    mockRepo.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['psychologist_profiles_nik_key'] },
      }),
    );

    await expect(service.updateProfile('u1', dto)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.updateProfile('u1', dto)).rejects.toThrow(
      'duplicate_nik',
    );
  });

  it('should reject a non-16-digit NIK at the schema', () => {
    expect(UpdateProfileSchema.safeParse({ ...dto, nik: '123' }).success).toBe(
      false,
    );
    expect(
      UpdateProfileSchema.safeParse({ ...dto, nik: 'abcdefghijklmnop' })
        .success,
    ).toBe(false);
  });

  it('should reject a short institutionName at the schema', () => {
    expect(
      UpdateProfileSchema.safeParse({ ...dto, institutionName: 'R' }).success,
    ).toBe(false);
  });
});

describe('PsychologistService.getProfile completeness', () => {
  let service: PsychologistService;
  let mockRepo: {
    findByUserId: jest.Mock;
    findSigners: jest.Mock;
    upsert: jest.Mock;
    updateSignature: jest.Mock;
  };
  let mockConfig: { get: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      findByUserId: jest.fn(),
      findSigners: jest.fn(),
      upsert: jest.fn(),
      updateSignature: jest.fn(),
    };
    mockConfig = { get: jest.fn().mockReturnValue('./uploads') };
    service = new PsychologistService(mockRepo, mockConfig as never);
  });

  it('should be complete without a degree when name, license, and signature exist', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      fullName: 'Budi',
      degree: '',
      licenseNumber: 'SIPP-123',
      nik: '3201010101010001',
      institutionName: 'RS Harapan',
      signatureImagePath: 'uploads/sig.png',
    });

    const { complete } = await service.getProfile('u1');

    expect(complete).toBe(true);
  });

  it('should be incomplete when the license number is missing', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      fullName: 'Budi',
      degree: 'Psikolog',
      licenseNumber: '',
      nik: '3201010101010001',
      institutionName: 'RS Harapan',
      signatureImagePath: 'uploads/sig.png',
    });

    const { complete } = await service.getProfile('u1');

    expect(complete).toBe(false);
  });

  it('should be incomplete when the NIK is missing', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      fullName: 'Budi',
      degree: 'Psikolog',
      licenseNumber: 'SIPP-123',
      nik: null,
      institutionName: 'RS Harapan',
      signatureImagePath: 'uploads/sig.png',
    });

    const { complete } = await service.getProfile('u1');

    expect(complete).toBe(false);
  });

  it('should be incomplete when the institution is missing', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      fullName: 'Budi',
      degree: 'Psikolog',
      licenseNumber: 'SIPP-123',
      nik: '3201010101010001',
      institutionName: null,
      signatureImagePath: 'uploads/sig.png',
    });

    const { complete } = await service.getProfile('u1');

    expect(complete).toBe(false);
  });
});

describe('PsychologistService.getSignaturePath', () => {
  let service: PsychologistService;
  let mockRepo: {
    findByUserId: jest.Mock;
    findSigners: jest.Mock;
    upsert: jest.Mock;
    updateSignature: jest.Mock;
  };
  let mockConfig: { get: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      findByUserId: jest.fn(),
      findSigners: jest.fn(),
      upsert: jest.fn(),
      updateSignature: jest.fn(),
    };
    mockConfig = { get: jest.fn().mockReturnValue('./uploads') };
    service = new PsychologistService(mockRepo, mockConfig as never);
    jest.mocked(fs.existsSync).mockReset();
  });

  it('should return the resolved path when the file exists', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      signatureImagePath: 'uploads/sig.png',
    });
    jest.mocked(fs.existsSync).mockReturnValue(true);

    const result = await service.getSignaturePath('u1');

    expect(result).toBe(path.resolve('uploads/sig.png'));
  });

  it('should throw 404 when no signature is stored', async () => {
    mockRepo.findByUserId.mockResolvedValue({ signatureImagePath: '' });

    await expect(service.getSignaturePath('u1')).rejects.toThrow(
      'signature_not_found',
    );
  });

  it('should throw 404 when the profile is missing', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);

    await expect(service.getSignaturePath('u1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw 404 for a path escaping the upload dir', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      signatureImagePath: '../etc/passwd',
    });

    await expect(service.getSignaturePath('u1')).rejects.toThrow(
      'signature_not_found',
    );
  });

  it('should throw 404 when the file is gone from disk', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      signatureImagePath: 'uploads/sig.png',
    });
    jest.mocked(fs.existsSync).mockReturnValue(false);

    await expect(service.getSignaturePath('u1')).rejects.toThrow(
      'signature_not_found',
    );
  });
});

describe('PsychologistService.listPublic', () => {
  let service: PsychologistService;
  let mockRepo: {
    findByUserId: jest.Mock;
    findSigners: jest.Mock;
    upsert: jest.Mock;
    updateSignature: jest.Mock;
  };

  beforeEach(() => {
    mockRepo = {
      findByUserId: jest.fn(),
      findSigners: jest.fn(),
      upsert: jest.fn(),
      updateSignature: jest.fn(),
    };
    service = new PsychologistService(mockRepo, { get: jest.fn() } as never);
  });

  it('should return only the credentials the report prints', async () => {
    mockRepo.findSigners.mockResolvedValue([
      {
        id: 'p1',
        userId: 'u1',
        fullName: 'Ayu Lestari',
        degree: 'Psikolog',
        licenseNumber: 'STR-123',
        sippNumber: 'SIPP-9',
        nik: '3201010101010001',
        institutionName: 'RS Harapan',
        signatureImagePath: 'uploads/sig.png',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.listPublic();

    expect(result).toEqual([
      {
        fullName: 'Ayu Lestari',
        degree: 'Psikolog',
        licenseNumber: 'STR-123',
        sippNumber: 'SIPP-9',
        institutionName: 'RS Harapan',
      },
    ]);
    // NIK and the signature file must never reach a public response.
    expect(result[0]).not.toHaveProperty('nik');
    expect(result[0]).not.toHaveProperty('signatureImagePath');
  });

  it('should skip a profile with no name or no registration number', async () => {
    mockRepo.findSigners.mockResolvedValue([
      { fullName: '', degree: 'Psikolog', licenseNumber: 'STR-1' },
      { fullName: 'Budi', degree: 'Psikolog', licenseNumber: '' },
      { fullName: 'Citra', degree: '', licenseNumber: 'STR-3' },
    ]);

    const result = await service.listPublic();

    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe('Citra');
  });

  it('should return an empty list when nobody signs yet', async () => {
    mockRepo.findSigners.mockResolvedValue([]);

    await expect(service.listPublic()).resolves.toEqual([]);
  });
});
