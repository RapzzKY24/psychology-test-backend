import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Institution, Prisma } from '../../../generated/prisma/client';
import type { InstitutionsRepository } from './institutions.repository';

@Injectable()
export class PrismaInstitutionsRepository implements InstitutionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Institution | null> {
    return this.prisma.institution.findUnique({ where: { id } });
  }

  async findMany(params: {
    skip: number;
    take: number;
  }): Promise<{ data: Institution[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.institution.findMany({
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.institution.count(),
    ]);
    return { data, total };
  }

  create(data: Prisma.InstitutionCreateInput): Promise<Institution> {
    return this.prisma.institution.create({ data });
  }

  update(
    id: string,
    data: Prisma.InstitutionUpdateInput,
  ): Promise<Institution> {
    return this.prisma.institution.update({ where: { id }, data });
  }
}
