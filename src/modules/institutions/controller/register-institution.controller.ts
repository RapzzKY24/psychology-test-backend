import { Body, Controller, Ip, Post, Res } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RegisterInstitutionSchema } from '../dto/register-institution.dto';
import type { RegisterInstitutionDto } from '../dto/register-institution.dto';
import { RegisterInstitutionService } from '../service/register-institution.service';
import type { RegisterInstitutionResult } from '../service/register-institution.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1')
export class RegisterInstitutionController {
  constructor(
    private readonly registerInstitutionService: RegisterInstitutionService,
  ) {}

  // Public: institution self-registration — returns the session cookie.
  // Rate-limited per IP in the service (10/min).
  @Post('register-institution')
  @AllowAnonymous()
  async register(
    @Body(new ZodValidationPipe(RegisterInstitutionSchema))
    dto: RegisterInstitutionDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<
    ApiResponse<{
      user: { id: string; email: string; role: string };
      institution: { id: string; name: string };
    }>
  > {
    const { cookies, user, institution }: RegisterInstitutionResult =
      await this.registerInstitutionService.register(dto, ip);

    for (const cookie of cookies) {
      response.append('set-cookie', cookie);
    }

    return {
      data: {
        user: { id: user.id, email: user.email, role: user.role },
        institution: { id: institution.id, name: institution.name },
      },
      message: 'Institution registered',
    };
  }
}
