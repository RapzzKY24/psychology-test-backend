import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateInstitutionSchema } from '../dto/create-institution.dto';
import type { CreateInstitutionDto } from '../dto/create-institution.dto';
import { UpdateInstitutionSchema } from '../dto/update-institution.dto';
import type { UpdateInstitutionDto } from '../dto/update-institution.dto';
import { ReplaceInstitutionTestPricesSchema } from '../dto/institution-test-prices.dto';
import type { ReplaceInstitutionTestPricesDto } from '../dto/institution-test-prices.dto';
import { InstitutionsService } from '../service/institutions.service';
import type { Institution } from '../../../generated/prisma/client';
import type { InstitutionTestPriceView } from '../repository/institutions.repository';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/admin/institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Post()
  @Roles(['ADMIN'])
  async create(
    @Body(new ZodValidationPipe(CreateInstitutionSchema))
    dto: CreateInstitutionDto,
  ): Promise<ApiResponse<Institution>> {
    const data = await this.institutionsService.create(dto);
    return { data, message: 'Institution created' };
  }

  @Get()
  @Roles(['ADMIN'])
  async findMany(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<Institution>> {
    return this.institutionsService.findMany(query);
  }

  @Patch(':id')
  @Roles(['ADMIN'])
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateInstitutionSchema))
    dto: UpdateInstitutionDto,
  ): Promise<ApiResponse<Institution>> {
    const data = await this.institutionsService.update(id, dto);
    return { data };
  }

  @Get(':id')
  @Roles(['ADMIN'])
  async findOne(@Param('id') id: string): Promise<ApiResponse<Institution>> {
    const data = await this.institutionsService.findOne(id);
    return { data };
  }

  @Get(':id/test-prices')
  @Roles(['ADMIN'])
  async listTestPrices(
    @Param('id') id: string,
  ): Promise<ApiResponse<InstitutionTestPriceView[]>> {
    const data = await this.institutionsService.listTestPrices(id);
    return { data };
  }

  @Put(':id/test-prices')
  @Roles(['ADMIN'])
  async replaceTestPrices(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReplaceInstitutionTestPricesSchema))
    dto: ReplaceInstitutionTestPricesDto,
  ): Promise<ApiResponse<InstitutionTestPriceView[]>> {
    const data = await this.institutionsService.replaceTestPrices(id, dto);
    return { data };
  }
}
