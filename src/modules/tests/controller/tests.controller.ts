import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateTestSchema } from '../dto/create-test.dto';
import type { CreateTestDto } from '../dto/create-test.dto';
import { UpdateTestSchema } from '../dto/update-test.dto';
import type { UpdateTestDto } from '../dto/update-test.dto';
import { TestsService } from '../service/tests.service';
import { QueryTestSchema } from '../dto/query-test.dto';
import type { QueryTestDto } from '../dto/query-test.dto';
import type {
  PaginatedResponse,
  ApiResponse,
} from '../../../common/interfaces/api-response.interface';
import type { Test } from '../../../generated/prisma/client';

@Controller('api/v1/admin/tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Post()
  @Roles(['ADMIN'])
  async create(
    @Body(new ZodValidationPipe(CreateTestSchema)) dto: CreateTestDto,
  ): Promise<ApiResponse<Test>> {
    const data = await this.testsService.create(dto);
    return { data, message: 'Test created' };
  }

  @Get()
  @Roles(['ADMIN'])
  async findMany(
    @Query(new ZodValidationPipe(QueryTestSchema)) query: QueryTestDto,
  ): Promise<PaginatedResponse<Test>> {
    return this.testsService.findMany(query);
  }

  @Get(':id')
  @Roles(['ADMIN'])
  async findOne(@Param('id') id: string): Promise<ApiResponse<Test>> {
    const data = await this.testsService.findById(id);
    return { data };
  }

  @Patch(':id')
  @Roles(['ADMIN'])
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTestSchema)) dto: UpdateTestDto,
  ): Promise<ApiResponse<Test>> {
    const data = await this.testsService.update(id, dto);
    return { data };
  }
}
