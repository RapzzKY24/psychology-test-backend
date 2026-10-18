import { Controller, Get, Query } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { InstansiResultsService } from '../service/instansi-results.service';
import type { InstansiResultItemDto } from '../dto/instansi-result.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/instansi/results')
@Roles(['INSTANSI'])
export class InstansiResultsController {
  constructor(private readonly resultsService: InstansiResultsService) {}

  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<InstansiResultItemDto>> {
    return this.resultsService.list(session.user.id, query);
  }
}
