import { Controller, Get, Param, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { TestsService } from '../service/tests.service';
import { QueryTestSchema } from '../dto/query-test.dto';
import type { QueryTestDto } from '../dto/query-test.dto';
import type { PublicTestDto } from '../dto/public-test.dto';
import type {
  PaginatedResponse,
  ApiResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/tests')
@AllowAnonymous()
export class PublicTestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  async findMany(
    @Query(new ZodValidationPipe(QueryTestSchema)) query: QueryTestDto,
  ): Promise<PaginatedResponse<PublicTestDto>> {
    return this.testsService.findManyPublic(query);
  }

  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
  ): Promise<ApiResponse<PublicTestDto>> {
    const data = await this.testsService.findBySlugPublic(slug);
    return { data };
  }
}
