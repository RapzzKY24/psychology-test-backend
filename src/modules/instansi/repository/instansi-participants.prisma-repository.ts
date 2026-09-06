import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  InstansiParticipantsRepository,
  FindManyParams,
  CreateInstansiParticipantParams,
  UpdateInstansiParticipantParams,
} from './instansi-participants.repository';
import type { InstitutionParticipant } from '../../../generated/prisma/client';

@Injectable()
export class InstansiParticipantsPrismaRepository implements InstansiParticipantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(params: FindManyParams): Promise<{
    data: InstitutionParticipant[];
    total: number;
  }> {
    const [data, total] = await Promise.all([
      this.prisma.institutionParticipant.findMany({
        where: { institutionId: params.institutionId },
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.institutionParticipant.count({
        where: { institutionId: params.institutionId },
      }),
    ]);
    return { data, total };
  }

  async findById(
    id: string,
    institutionId: string,
  ): Promise<InstitutionParticipant | null> {
    return this.prisma.institutionParticipant.findFirst({
      where: { id, institutionId },
    });
  }

  async findManyByIds(
    institutionId: string,
    ids: string[],
  ): Promise<InstitutionParticipant[]> {
    if (ids.length === 0) return [];
    return this.prisma.institutionParticipant.findMany({
      where: { institutionId, id: { in: ids } },
    });
  }

  async findByIdNumber(
    institutionId: string,
    idNumber: string,
  ): Promise<InstitutionParticipant | null> {
    return this.prisma.institutionParticipant.findFirst({
      where: { institutionId, idNumber },
    });
  }

  async create(
    params: CreateInstansiParticipantParams,
  ): Promise<InstitutionParticipant> {
    return this.prisma.institutionParticipant.create({
      data: {
        institutionId: params.institutionId,
        name: params.name,
        destinationCountry: params.destinationCountry,
        idType: params.idType,
        idNumber: params.idNumber,
        birthDate: params.birthDate,
        phone: params.phone,
        notes: params.notes,
      },
    });
  }

  async update(
    id: string,
    institutionId: string,
    data: UpdateInstansiParticipantParams,
  ): Promise<InstitutionParticipant | null> {
    const result = await this.prisma.institutionParticipant.updateMany({
      where: { id, institutionId },
      data,
    });
    if (result.count === 0) return null;
    return this.prisma.institutionParticipant.findFirst({
      where: { id, institutionId },
    });
  }

  async delete(id: string, institutionId: string): Promise<{ count: number }> {
    const result = await this.prisma.institutionParticipant.deleteMany({
      where: { id, institutionId },
    });
    return { count: result.count };
  }
}
