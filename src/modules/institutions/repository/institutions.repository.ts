import type { Institution, Prisma } from '../../../generated/prisma/client';

export const INSTITUTIONS_REPOSITORY = 'InstitutionsRepository';

export interface RegisterOwnerInput {
  userId: string;
  name: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  address?: string;
}

export interface RegisteredOwner {
  user: { id: string; email: string; role: string };
  institution: Institution;
}

export interface InstitutionsRepository {
  findById(id: string): Promise<Institution | null>;
  findByOwnerUserId(ownerUserId: string): Promise<Institution | null>;
  findMany(params: {
    skip: number;
    take: number;
  }): Promise<{ data: Institution[]; total: number }>;
  create(data: Prisma.InstitutionCreateInput): Promise<Institution>;
  update(id: string, data: Prisma.InstitutionUpdateInput): Promise<Institution>;
  promoteUserAndCreateInstitution(
    input: RegisterOwnerInput,
  ): Promise<RegisteredOwner>;
  deleteUserById(userId: string): Promise<void>;
}
