import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from '../repository/instansi-participants.repository';
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';
import type {
  InstitutionParticipant,
  IdType,
} from '../../../generated/prisma/client';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';

export interface CreateInstansiParticipantData {
  name: string;
  destinationCountry: string;
  idType: IdType;
  idNumber: string;
  birthDate?: Date;
  phone?: string;
  notes?: string;
}

export interface UpdateInstansiParticipantData {
  name?: string;
  destinationCountry?: string;
  birthDate?: Date;
  phone?: string;
  notes?: string;
}

/**
 * Instansi-scoped employee master data service. All queries are filtered by
 * `institutionId` derived from the caller (ownerUserId → institution), never
 * from the request body or params.
 */
@Injectable()
export class InstansiParticipantsService {
  constructor(
    @Inject(INSTANSI_PARTICIPANTS_REPOSITORY)
    private readonly repo: InstansiParticipantsRepository,
  ) {}

  async list(
    institutionId: string,
    pagination: { page: number; limit: number },
  ): Promise<PaginatedResponse<InstitutionParticipant>> {
    const skip = (pagination.page - 1) * pagination.limit;
    const { data, total } = await this.repo.findMany({
      institutionId,
      skip,
      take: pagination.limit,
    });
    return {
      data,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async get(
    id: string,
    institutionId: string,
  ): Promise<ApiResponse<InstitutionParticipant>> {
    const participant = await this.repo.findById(id, institutionId);
    if (!participant) throw new NotFoundException('Participant not found');
    return { data: participant };
  }

  async create(
    institutionId: string,
    data: CreateInstansiParticipantData,
  ): Promise<ApiResponse<InstitutionParticipant>> {
    const existing = await this.repo.findByIdNumber(
      institutionId,
      data.idNumber,
    );
    if (existing) {
      throw new ConflictException('duplicate_id_number');
    }
    const created = await this.repo.create({
      institutionId,
      ...data,
    });
    return { data: created, message: 'Participant created' };
  }

  async update(
    id: string,
    institutionId: string,
    data: UpdateInstansiParticipantData,
  ): Promise<ApiResponse<InstitutionParticipant>> {
    const updated = await this.repo.update(id, institutionId, data);
    if (!updated) throw new NotFoundException('Participant not found');
    return { data: updated, message: 'Participant updated' };
  }

  async remove(id: string, institutionId: string): Promise<void> {
    await this.repo.delete(id, institutionId);
  }
}
