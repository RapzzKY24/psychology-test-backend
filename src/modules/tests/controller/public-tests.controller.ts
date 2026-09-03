import { Controller, Get, Param, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { TestsService } from '../service/tests.service';
import { QueryTestSchema } from '../dto/query-test.dto';
import type { QueryTestDto } from '../dto/query-test.dto';
import type {
  PaginatedResponse,
  ApiResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/tests')
export class PublicTestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  async findMany(
    @Query(new ZodValidationPipe(QueryTestSchema)) query: QueryTestDto,
    @Session() _session: UserSession,
  ): Promise<PaginatedResponse<unknown>> {
    void _session;
    const result = await this.testsService.findManyPublic(query);
    return result;
  }

  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
    @Session() _session: UserSession,
  ): Promise<ApiResponse<unknown>> {
    void _session;
    const data = await this.testsService.findBySlugPublic(slug);
    return { data };
  }
}
