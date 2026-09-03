import { Controller, Get, Param, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
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
  @AllowAnonymous()
  async findMany(
    @Query(new ZodValidationPipe(QueryTestSchema)) query: QueryTestDto,
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.testsService.findManyPublic(query);
    return result;
  }

  @Get(':slug')
  @AllowAnonymous()
  async findOne(@Param('slug') slug: string): Promise<ApiResponse<unknown>> {
    const data = await this.testsService.findBySlugPublic(slug);
    return { data };
  }
}
