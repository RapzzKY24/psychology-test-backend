import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { Express } from 'express';
import { validateItemImageFile } from '../utils/validate-item-image-file';
import { generateItemImageFilename } from '../utils/generate-item-image-filename';
import { ensureUploadDir } from '../../../lib/fs/ensure-upload-dir';
import { CreateTestSchema } from '../dto/create-test.dto';
import type { CreateTestDto } from '../dto/create-test.dto';
import { UpdateTestSchema } from '../dto/update-test.dto';
import type { UpdateTestDto } from '../dto/update-test.dto';
import { TestsService } from '../service/tests.service';
import { TestsPublishService } from '../service/tests-publish.service';
import { QueryTestSchema } from '../dto/query-test.dto';
import type { QueryTestDto } from '../dto/query-test.dto';
import { PutItemsSchema } from '../dto/put-items.dto';
import type { PutItemsDto } from '../dto/put-items.dto';
import { PutInterpretationsSchema } from '../dto/put-interpretations.dto';
import type { PutInterpretationsDto } from '../dto/put-interpretations.dto';
import type {
  PaginatedResponse,
  ApiResponse,
} from '../../../common/interfaces/api-response.interface';
import type { Test } from '../../../generated/prisma/client';
import type { TestDetail } from '../service/tests.service';

@Controller('api/v1/admin/tests')
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    private readonly publishService: TestsPublishService,
    private readonly configService: ConfigService,
  ) {}

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
  async findOne(@Param('id') id: string): Promise<ApiResponse<TestDetail>> {
    const data = await this.testsService.findDetailById(id);
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

  @Post(':id/items/image')
  @Roles(['ADMIN'])
  @UseInterceptors(FileInterceptor('file'))
  async uploadItemImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponse<{ imageUrl: string }>> {
    // Ensure test exists — 404 if not
    await this.testsService.findById(id);
    validateItemImageFile(file);
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    const itemDir = path.join(uploadDir, 'test-items');
    await ensureUploadDir(itemDir);
    const filename = generateItemImageFilename(
      file.originalname,
      file.mimetype,
    );
    const filepath = path.join(itemDir, filename);
    await fs.promises.writeFile(filepath, file.buffer);
    const imageUrl = `/uploads/test-items/${filename}`;
    return { data: { imageUrl } };
  }

  @Put(':id/items')
  @Roles(['ADMIN'])
  async putItems(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PutItemsSchema)) dto: PutItemsDto,
  ): Promise<ApiResponse<{ count: number }>> {
    const data = await this.testsService.putItems(id, dto.items);
    return { data };
  }

  @Put(':id/interpretations')
  @Roles(['ADMIN'])
  async putInterpretations(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PutInterpretationsSchema))
    dto: PutInterpretationsDto,
  ): Promise<ApiResponse<{ count: number }>> {
    const data = await this.testsService.putInterpretations(
      id,
      dto.interpretations,
    );
    return { data };
  }

  @Post(':id/publish')
  @Roles(['ADMIN'])
  async publish(@Param('id') id: string): Promise<ApiResponse<Test>> {
    const data = await this.publishService.publish(id);
    return { data };
  }

  @Post(':id/archive')
  @Roles(['ADMIN'])
  async archive(@Param('id') id: string): Promise<ApiResponse<Test>> {
    const data = await this.publishService.archive(id);
    return { data };
  }
}
