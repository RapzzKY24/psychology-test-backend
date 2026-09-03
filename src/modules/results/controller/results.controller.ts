import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryResultsSchema } from '../dto/query-results.dto';
import type { QueryResultsDto } from '../dto/query-results.dto';
import { ResultsService } from '../service/results.service';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import type { TestResult } from '../../../generated/prisma/client';
import type { Request } from 'express';

@Controller('api/v1')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  // Public: owner only (user cookie or x-participant-token), 403 until APPROVED
  @Get('public/attempts/:id/result')
  async getPublicResult(
    @Param('id') id: string,
    @Session() session: UserSession | null,
    @Req() req: Request,
  ): Promise<
    ApiResponse<{
      patternCode: string;
      scores: unknown;
      interpretation: unknown;
      completedAt: Date | null;
    }>
  > {
    const participantToken = req.headers['x-participant-token'] as
      string | undefined;
    const owner = {
      userId: (session as unknown as { user?: { id: string } } | null)?.user
        ?.id,
      participantToken,
    };
    // If no owner at all, treat as not found (anti-leak) — service will throw 404
    const data = await this.resultsService.getPublicResult(id, owner);
    return { data };
  }

  // Admin: full
  @Get('admin/attempts/:id/result')
  @Roles(['ADMIN'])
  async getAdminResult(@Param('id') id: string): Promise<
    ApiResponse<{
      result: TestResult;
      interpretation: unknown;
      scores: unknown;
    }>
  > {
    const data = await this.resultsService.getAdminResult(id);
    return { data };
  }

  // Admin list
  @Get('admin/results')
  @Roles(['ADMIN'])
  async listResults(
    @Query(new ZodValidationPipe(QueryResultsSchema)) query: QueryResultsDto,
  ): Promise<PaginatedResponse<TestResult>> {
    return this.resultsService.listResults(query);
  }
}
