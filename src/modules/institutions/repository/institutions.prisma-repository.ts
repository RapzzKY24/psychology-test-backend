import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Institution, Prisma } from '../../../generated/prisma/client';
import type {
  InstitutionsRepository,
  RegisterOwnerInput,
  RegisteredOwner,
} from './institutions.repository';

@Injectable()
export class PrismaInstitutionsRepository implements InstitutionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Institution | null> {
    return this.prisma.institution.findUnique({ where: { id } });
  }

  findByOwnerUserId(ownerUserId: string): Promise<Institution | null> {
    return this.prisma.institution.findUnique({ where: { ownerUserId } });
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

  async promoteUserAndCreateInstitution(
    input: RegisterOwnerInput,
  ): Promise<RegisteredOwner> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: input.userId },
        data: { role: 'INSTANSI' },
        select: { id: true, email: true, role: true },
      });
      const institution = await tx.institution.create({
        data: {
          name: input.name,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          phone: input.phone,
          address: input.address,
          ownerUserId: user.id,
        },
      });
      return { user, institution };
    });
  }

  async deleteUserById(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
