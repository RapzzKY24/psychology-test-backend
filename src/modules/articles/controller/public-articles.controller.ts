import { Controller, Get, Param, Query, Res, HttpStatus } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryArticleSchema } from '../dto/query-article.dto';
import type { QueryArticleDto } from '../dto/query-article.dto';
import type { PublicArticleDto } from '../dto/article.dto';
import { ArticlesService } from '../service/articles.service';
import type {
  ApiResponse,
  ErrorResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import type { Response } from 'express';

@Controller('api/v1/articles')
@AllowAnonymous()
export class PublicArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  async findMany(
    @Query(new ZodValidationPipe(QueryArticleSchema)) query: QueryArticleDto,
  ): Promise<PaginatedResponse<PublicArticleDto>> {
    return this.articlesService.findManyPublic(query);
  }

  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
  ): Promise<ApiResponse<PublicArticleDto>> {
    const data = await this.articlesService.findBySlugPublic(slug);
    return { data };
  }

  @Get(':slug/cover')
  async streamCover(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.articlesService.getCoverPathBySlug(slug);
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
}
