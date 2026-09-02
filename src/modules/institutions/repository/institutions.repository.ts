import type { Institution, Prisma } from '../../../generated/prisma/client';

export const INSTITUTIONS_REPOSITORY = 'InstitutionsRepository';

export interface InstitutionsRepository {
  findById(id: string): Promise<Institution | null>;
  findMany(params: {
    skip: number;
    take: number;
  }): Promise<{ data: Institution[]; total: number }>;
  create(data: Prisma.InstitutionCreateInput): Promise<Institution>;
  update(id: string, data: Prisma.InstitutionUpdateInput): Promise<Institution>;
}
