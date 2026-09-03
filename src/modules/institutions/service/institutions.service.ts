import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { INSTITUTIONS_REPOSITORY } from '../repository/institutions.repository';
import type { InstitutionsRepository } from '../repository/institutions.repository';
import type { CreateInstitutionDto } from '../dto/create-institution.dto';
import type { UpdateInstitutionDto } from '../dto/update-institution.dto';
import type { Institution } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

@Injectable()
export class InstitutionsService {
  constructor(
    @Inject(INSTITUTIONS_REPOSITORY)
    private readonly repo: InstitutionsRepository,
  ) {}

  create(dto: CreateInstitutionDto): Promise<Institution> {
    return this.repo.create(dto);
  }

  async findMany(query: {
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<Institution>> {
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findMany({
      skip,
      take: query.limit,
    });
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async update(id: string, dto: UpdateInstitutionDto): Promise<Institution> {
    const institution = await this.repo.findById(id);
    if (!institution) throw new NotFoundException('Institution not found');
    return this.repo.update(id, dto);
  }
}
