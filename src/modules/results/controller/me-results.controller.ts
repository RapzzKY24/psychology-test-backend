import { Controller, Get, Param, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { MeResultsService } from '../service/me-results.service';
import type { MeResultListItemDto } from '../dto/me-result.dto';
import type { MeResultViewDto } from '../dto/me-result.dto';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/me/results')
export class MeResultsController {
  constructor(private readonly meResultsService: MeResultsService) {}

  // Own APPROVED results, paginated (feature 08 §API contract)
  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<MeResultListItemDto>> {
    return this.meResultsService.list(session.user.id, query);
  }

  // Owner-only web view, same shape as the feature 05 public result
  @Get(':attemptId')
  async getOwnResult(
    @Session() session: UserSession,
    @Param('attemptId') attemptId: string,
  ): Promise<ApiResponse<MeResultViewDto>> {
    const data = await this.meResultsService.getOwnResult(
      session.user.id,
      attemptId,
    );
    return { data };
  }
}
