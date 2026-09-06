import { ConflictException, NotFoundException } from '@nestjs/common';
import { InstansiParticipantsService } from '../service/instansi-participants.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in type cast
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';

describe('InstansiParticipantsService', () => {
  let service: InstansiParticipantsService;
  let mockRepo: {
    findMany: jest.Mock;
    findById: jest.Mock;
    findByIdNumber: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockInstitutionsRepo: {
    findByOwnerUserId: jest.Mock;
  };

  const INSTITUTION_ID = 'inst-1';
  const FOREIGN_ID = 'foreign-id';

  const existingRow = {
    id: 'r1',
    institutionId: INSTITUTION_ID,
    name: 'Budi',
    destinationCountry: 'Belanda',
    idType: 'NIK',
    idNumber: '3201234567890001',
    birthDate: new Date('2000-01-15'),
    phone: '0812',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findByIdNumber: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockInstitutionsRepo = {
      findByOwnerUserId: jest.fn(),
    };
    service = new InstansiParticipantsService(
      mockRepo,
      mockInstitutionsRepo as never,
    );
  });

  describe('resolveInstitutionId', () => {
    it('returns the institution id for the owner', async () => {
      mockInstitutionsRepo.findByOwnerUserId.mockResolvedValue({
        id: INSTITUTION_ID,
      });

      const result = await service.resolveInstitutionId('user-1');

      expect(result).toBe(INSTITUTION_ID);
      expect(mockInstitutionsRepo.findByOwnerUserId).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('throws 404 for a user without an institution', async () => {
      mockInstitutionsRepo.findByOwnerUserId.mockResolvedValue(null);

      await expect(service.resolveInstitutionId('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('returns PaginatedResponse with meta', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [existingRow],
        total: 1,
      });

      const result = await service.list(INSTITUTION_ID, { page: 1, limit: 10 });

      expect(mockRepo.findMany).toHaveBeenCalledWith({
        institutionId: INSTITUTION_ID,
        skip: 0,
        take: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('get', () => {
    it('returns the participant when found', async () => {
      mockRepo.findById.mockResolvedValue(existingRow);

      const result = await service.get('r1', INSTITUTION_ID);

      expect(result.data).toEqual(existingRow);
    });

    it('throws NotFound for a foreign institution id', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.get(FOREIGN_ID, INSTITUTION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates via repo with institutionId set', async () => {
      mockRepo.findByIdNumber.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(existingRow);

      const result = await service.create(INSTITUTION_ID, {
        name: 'Budi',
        destinationCountry: 'Belanda',
        idType: 'NIK',
        idNumber: '3201234567890001',
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: INSTITUTION_ID,
          name: 'Budi',
        }),
      );
      expect(result.data.id).toBe('r1');
    });

    it('throws Conflict when idNumber already exists in this institution', async () => {
      mockRepo.findByIdNumber.mockResolvedValue(existingRow);

      await expect(
        service.create(INSTITUTION_ID, {
          name: 'Budi Dua',
          destinationCountry: 'Belanda',
          idType: 'NIK',
          idNumber: '3201234567890001',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps a P2002 race on create to duplicate_id_number', async () => {
      mockRepo.findByIdNumber.mockResolvedValue(null);
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      mockRepo.create.mockRejectedValue(p2002);

      await expect(
        service.create(INSTITUTION_ID, {
          name: 'Budi Tiga',
          destinationCountry: 'Belanda',
          idType: 'NIK',
          idNumber: '3201234567890001',
        }),
      ).rejects.toThrow('duplicate_id_number');
    });
  });

  describe('update', () => {
    it('throws NotFound for foreign id (anti-leak 404)', async () => {
      mockRepo.update.mockResolvedValue(null);

      await expect(
        service.update(FOREIGN_ID, INSTITUTION_ID, { name: 'Hacker' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('delegates to repo delete', async () => {
      mockRepo.delete.mockResolvedValue({ count: 1 });

      await service.remove('r1', INSTITUTION_ID);

      expect(mockRepo.delete).toHaveBeenCalledWith('r1', INSTITUTION_ID);
    });

    it('throws NotFound for a foreign id (count 0, anti-leak 404)', async () => {
      mockRepo.delete.mockResolvedValue({ count: 0 });

      await expect(service.remove(FOREIGN_ID, INSTITUTION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
