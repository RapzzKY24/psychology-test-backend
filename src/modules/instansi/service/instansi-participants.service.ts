import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from '../repository/instansi-participants.repository';
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';
import { INSTITUTIONS_REPOSITORY } from '../../institutions/repository/institutions.repository';
import type { InstitutionsRepository } from '../../institutions/repository/institutions.repository';
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
    @Inject(INSTITUTIONS_REPOSITORY)
    private readonly institutionsRepo: InstitutionsRepository,
  ) {}

  /**
   * Resolves institutionId from the session user via
   * Institution.ownerUserId (unique). Users without an institution
   * (e.g. stale accounts) get 404 — never an empty-string scope.
   */
  async resolveInstitutionId(userId: string): Promise<string> {
    const institution = await this.institutionsRepo.findByOwnerUserId(userId);
    if (!institution) throw new NotFoundException('Institution not found');
    return institution.id;
  }

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
    try {
      const created = await this.repo.create({
        institutionId,
        ...data,
      });
      return { data: created, message: 'participant_created' };
    } catch (error) {
      // Race: two concurrent creates with the same idNumber both pass the
      // pre-check — the unique (institutionId, idNumber) constraint wins.
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        throw new ConflictException('duplicate_id_number');
      }
      throw error;
    }
  }

  async update(
    id: string,
    institutionId: string,
    data: UpdateInstansiParticipantData,
  ): Promise<ApiResponse<InstitutionParticipant>> {
    const updated = await this.repo.update(id, institutionId, data);
    if (!updated) throw new NotFoundException('Participant not found');
    return { data: updated, message: 'participant_updated' };
  }

  async remove(id: string, institutionId: string): Promise<void> {
    const result = await this.repo.delete(id, institutionId);
    if (result.count === 0)
      throw new NotFoundException('Participant not found');
  }
}
