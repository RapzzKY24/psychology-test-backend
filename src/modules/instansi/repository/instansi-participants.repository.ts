import type {
  InstitutionParticipant,
  IdType,
} from '../../../generated/prisma/client';

export const INSTANSI_PARTICIPANTS_REPOSITORY =
  'InstansiParticipantsRepository';

/** Flat row returned by the prisma repo (strips relation fields). */
export type InstansiParticipantRow = InstitutionParticipant;

export interface FindManyParams {
  institutionId: string;
  skip: number;
  take: number;
}

export interface CreateInstansiParticipantParams {
  institutionId: string;
  name: string;
  destinationCountry: string;
  idType: IdType;
  idNumber: string;
  birthDate?: Date;
  phone?: string;
  notes?: string;
}

export interface UpdateInstansiParticipantParams {
  name?: string;
  destinationCountry?: string;
  idType?: IdType;
  birthDate?: Date;
  phone?: string;
  notes?: string;
}

export interface InstansiParticipantsRepository {
  findMany(params: FindManyParams): Promise<{
    data: InstitutionParticipant[];
    total: number;
  }>;
  findById(
    id: string,
    institutionId: string,
  ): Promise<InstitutionParticipant | null>;
  findByIdNumber(
    institutionId: string,
    idNumber: string,
  ): Promise<InstitutionParticipant | null>;
  create(
    params: CreateInstansiParticipantParams,
  ): Promise<InstitutionParticipant>;
  update(
    id: string,
    institutionId: string,
    data: UpdateInstansiParticipantParams,
  ): Promise<InstitutionParticipant | null>;
  delete(id: string, institutionId: string): Promise<{ count: number }>;
}
