import { Controller, Get, Post, Param, Body, Ip } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { JoinSessionSchema } from '../dto/join-session.dto';
import type { JoinSessionDto } from '../dto/join-session.dto';
import { ClaimSessionSchema } from '../dto/claim-session.dto';
import type { ClaimSessionDto } from '../dto/claim-session.dto';
import { SessionsService } from '../service/sessions.service';
import { SessionsPublicService } from '../service/sessions-public.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';
import type {
  JoinSessionResult,
  NeedsConfirmationResult,
} from '../repository/sessions.repository';
import type { PublicSessionPreviewDto } from '../dto/public-session-preview.dto';

@Controller('api/v1/public/sessions')
export class SessionsPublicController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly sessionsPublicService: SessionsPublicService,
  ) {}

  // Public-safe preview for the guest join page (no PIN material, no PII)
  @Get(':token')
  @AllowAnonymous()
  async getPreview(
    @Param('token') token: string,
  ): Promise<ApiResponse<PublicSessionPreviewDto>> {
    const data = await this.sessionsPublicService.getPreviewByToken(token);
    return { data };
  }

  @Post(':token/join')
  @AllowAnonymous()
  async join(
    @Ip() ip: string,
    @Param('token') token: string,
    @Body(new ZodValidationPipe(JoinSessionSchema)) dto: JoinSessionDto,
  ): Promise<ApiResponse<JoinSessionResult | NeedsConfirmationResult>> {
    const data = await this.sessionsService.join(token, dto, ip);
    return { data, message: 'Joined session' };
  }

  // Roster claim: pick a pre-created participant row, get a working token.
  @Post(':token/claim')
  @AllowAnonymous()
  async claim(
    @Ip() ip: string,
    @Param('token') token: string,
    @Body(new ZodValidationPipe(ClaimSessionSchema)) dto: ClaimSessionDto,
  ) {
    const data = await this.sessionsPublicService.claim(
      token,
      dto.participantId,
      ip,
    );
    return { data, message: 'Token issued' };
  }
}
