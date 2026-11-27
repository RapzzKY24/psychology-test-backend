import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { INSTITUTIONS_REPOSITORY } from '../repository/institutions.repository';
import type {
  InstitutionsRepository,
  InstitutionTestPriceView,
} from '../repository/institutions.repository';
import type { CreateInstitutionDto } from '../dto/create-institution.dto';
import type { UpdateInstitutionDto } from '../dto/update-institution.dto';
import type { ReplaceInstitutionTestPricesDto } from '../dto/institution-test-prices.dto';
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

  async findOne(id: string): Promise<Institution> {
    const institution = await this.repo.findById(id);
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  /** Every published test with this institution's deal price (null = list). */
  async listTestPrices(id: string): Promise<InstitutionTestPriceView[]> {
    const institution = await this.repo.findById(id);
    if (!institution) throw new NotFoundException('Institution not found');
    return this.repo.listPublishedTestsWithPrices(id);
  }

  async replaceTestPrices(
    id: string,
    dto: ReplaceInstitutionTestPricesDto,
  ): Promise<InstitutionTestPriceView[]> {
    const institution = await this.repo.findById(id);
    if (!institution) throw new NotFoundException('Institution not found');

    const published = await this.repo.listPublishedTestsWithPrices(id);
    const publishedIds = new Set(published.map((row) => row.testId));
    const invalid = dto.prices
      .filter((row) => !publishedIds.has(row.testId))
      .map((row) => row.testId);
    if (invalid.length > 0) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [`testIds: not published or unknown: ${invalid.join(', ')}`],
      });
    }

    await this.repo.replaceTestPrices(id, dto.prices);
    return this.repo.listPublishedTestsWithPrices(id);
  }
}
