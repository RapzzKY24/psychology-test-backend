import { IdType } from '../../../generated/prisma/client';
import { InstansiParticipantsPrismaRepository } from '../repository/instansi-participants.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('InstansiParticipantsPrismaRepository', () => {
  let repo: InstansiParticipantsPrismaRepository;
  let prisma: {
    institutionParticipant: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
  };

  const INSTITUTION_ID = 'inst-1';

  beforeEach(() => {
    prisma = {
      institutionParticipant: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
    };
    repo = new InstansiParticipantsPrismaRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('findMany', () => {
    it('filters by institutionId and returns paginated rows', async () => {
      const rows = [
        { id: 'r1', name: 'Budi', institutionId: INSTITUTION_ID },
        { id: 'r2', name: 'Siti', institutionId: INSTITUTION_ID },
      ];
      prisma.institutionParticipant.findMany.mockResolvedValue(rows);
      prisma.institutionParticipant.count.mockResolvedValue(2);

      const result = await repo.findMany({
        institutionId: INSTITUTION_ID,
        skip: 0,
        take: 10,
      });

      expect(prisma.institutionParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { institutionId: INSTITUTION_ID },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.data).toEqual(rows);
      expect(result.total).toBe(2);
    });
  });

  describe('findById', () => {
    it('returns null when the id does not belong to the institution', async () => {
      prisma.institutionParticipant.findFirst.mockResolvedValue(null);

      const result = await repo.findById('foreign-id', INSTITUTION_ID);

      expect(prisma.institutionParticipant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'foreign-id', institutionId: INSTITUTION_ID },
        }),
      );
      expect(result).toBeNull();
    });

    it('returns the participant when the id + institutionId match', async () => {
      const row = { id: 'r1', institutionId: INSTITUTION_ID, name: 'Budi' };
      prisma.institutionParticipant.findFirst.mockResolvedValue(row);

      const result = await repo.findById('r1', INSTITUTION_ID);

      expect(result).toEqual(row);
    });
  });

  describe('create', () => {
    it('creates with institutionId + all fields', async () => {
      const data = {
        name: 'Budi',
        destinationCountry: 'Belanda',
        idType: 'NIK' as IdType,
        idNumber: '3201234567890001',
        birthDate: new Date('2000-01-15'),
        phone: '0812',
      };
      const created = { id: 'new-1', institutionId: INSTITUTION_ID, ...data };

      prisma.institutionParticipant.create.mockResolvedValue(created);

      const result = await repo.create({
        institutionId: INSTITUTION_ID,
        ...data,
      });

      expect(prisma.institutionParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            institutionId: INSTITUTION_ID,
            name: 'Budi',
            destinationCountry: 'Belanda',
            idType: 'NIK',
          }),
        }),
      );
      expect(result.id).toBe('new-1');
    });
  });

  describe('update', () => {
    it('uses updateMany with composite (id + institutionId) scoping', async () => {
      const updated = { id: 'r1', name: 'Budi Updated' };
      prisma.institutionParticipant.updateMany.mockResolvedValue({ count: 1 });
      prisma.institutionParticipant.findFirst.mockResolvedValue(updated);

      const result = await repo.update('r1', INSTITUTION_ID, {
        name: 'Budi Updated',
      });

      expect(prisma.institutionParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1', institutionId: INSTITUTION_ID },
          data: { name: 'Budi Updated' },
        }),
      );
      expect(result!.name).toBe('Budi Updated');
    });

    it('returns null when the foreign id does not match (updateMany → count 0)', async () => {
      prisma.institutionParticipant.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.update('foreign-id', INSTITUTION_ID, {
        name: 'Hacker',
      });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('uses deleteMany with composite scoping and returns the count', async () => {
      prisma.institutionParticipant.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repo.delete('r1', INSTITUTION_ID);

      expect(prisma.institutionParticipant.deleteMany).toHaveBeenCalledWith({
        where: { id: 'r1', institutionId: INSTITUTION_ID },
      });
      expect(result).toEqual({ count: 1 });
    });

    it('returns count 0 for a foreign id (service maps to 404)', async () => {
      prisma.institutionParticipant.deleteMany.mockResolvedValue({ count: 0 });

      const result = await repo.delete('foreign-id', INSTITUTION_ID);

      expect(result).toEqual({ count: 0 });
    });
  });
});
