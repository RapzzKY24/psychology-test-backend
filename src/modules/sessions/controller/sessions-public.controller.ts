import { Controller, Post, Param, Body, Ip } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { JoinSessionSchema } from '../dto/join-session.dto';
import type { JoinSessionDto } from '../dto/join-session.dto';
import { SessionsService } from '../service/sessions.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';
import type { JoinSessionResult } from '../repository/sessions.repository';

@Controller('api/v1/public/sessions')
export class SessionsPublicController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post(':token/join')
  @AllowAnonymous()
  async join(
    @Ip() ip: string,
    @Param('token') token: string,
    @Body(new ZodValidationPipe(JoinSessionSchema)) dto: JoinSessionDto,
  ): Promise<ApiResponse<JoinSessionResult>> {
    const data = await this.sessionsService.join(token, dto, ip);
    return { data, message: 'Joined session' };
  }
}
