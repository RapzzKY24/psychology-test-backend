import { Controller, Inject, Param, Post } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ATTEMPTS_REPOSITORY } from '../repository/attempts.repository';
import type { AttemptsRepository } from '../repository/attempts.repository';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/admin/attempts')
@Roles(['ADMIN'])
export class AdminAttemptsController {
  constructor(
    @Inject(ATTEMPTS_REPOSITORY) private readonly attempts: AttemptsRepository,
  ) {}

  @Post(':id/reset-expired')
  async resetExpired(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
  ): Promise<ApiResponse<{ oldAttemptId: string; newAttemptId: string }>> {
    return { data: await this.attempts.resetExpiredAttempt(id) };
  }
}
