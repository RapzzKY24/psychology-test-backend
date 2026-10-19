import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateArticleSchema } from '../dto/create-article.dto';
import type { CreateArticleDto } from '../dto/create-article.dto';
import { UpdateArticleSchema } from '../dto/update-article.dto';
import type { UpdateArticleDto } from '../dto/update-article.dto';
import { QueryArticleSchema } from '../dto/query-article.dto';
import type { QueryArticleDto } from '../dto/query-article.dto';
import type {
  AdminArticleDto,
  AdminArticleListItemDto,
} from '../dto/article.dto';
import { ArticlesService } from '../service/articles.service';
import { validateArticleImageFile } from '../utils/validate-article-image-file';
import type {
  ApiResponse,
  ErrorResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import type { Express, Response } from 'express';

@Controller('api/v1/admin/articles')
@Roles(['ADMIN'])
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateArticleSchema)) dto: CreateArticleDto,
  ): Promise<ApiResponse<AdminArticleDto>> {
    const data = await this.articlesService.create(dto);
    return { data, message: 'Article created' };
  }

  @Get()
  async findMany(
    @Query(new ZodValidationPipe(QueryArticleSchema)) query: QueryArticleDto,
  ): Promise<PaginatedResponse<AdminArticleListItemDto>> {
    return this.articlesService.findManyAdmin(query);
  }

  @Post('images')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponse<{ url: string }>> {
    validateArticleImageFile(file);
    const data = await this.articlesService.saveImage(file);
    return { data };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
  ): Promise<ApiResponse<AdminArticleDto>> {
    const data = await this.articlesService.findById(id);
    return { data };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateArticleSchema)) dto: UpdateArticleDto,
  ): Promise<ApiResponse<AdminArticleDto>> {
    const data = await this.articlesService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.articlesService.remove(id);
    return { data: null, message: 'Article deleted' };
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponse<{ coverUrl: string }>> {
    validateArticleImageFile(file);
    const data = await this.articlesService.saveCover(id, file);
    return { data };
  }

  @Get(':id/cover')
  async streamCover(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.articlesService.getCoverPathById(id);
    res.sendFile(filePath, (err: unknown) => {
      if (err && !res.headersSent) {
        const body: ErrorResponse = {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'cover_not_found',
          error: 'NotFoundException',
        };
        res.status(HttpStatus.NOT_FOUND).json(body);
      }
    });
  }

  @Post(':id/publish')
  async publish(
    @Param('id') id: string,
  ): Promise<ApiResponse<AdminArticleDto>> {
    const data = await this.articlesService.publish(id);
    return { data };
  }

  @Post(':id/unpublish')
  async unpublish(
    @Param('id') id: string,
  ): Promise<ApiResponse<AdminArticleDto>> {
    const data = await this.articlesService.unpublish(id);
    return { data };
  }
}
