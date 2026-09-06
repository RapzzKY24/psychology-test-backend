import { Body, Controller, Post, Res } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RegisterInstitutionSchema } from '../dto/register-institution.dto';
import type { RegisterInstitutionDto } from '../dto/register-institution.dto';
import { RegisterInstitutionService } from '../service/register-institution.service';

@Controller('api/v1')
export class RegisterInstitutionController {
  constructor(
    private readonly registerInstitutionService: RegisterInstitutionService,
  ) {}

  // Public: institution self-registration — returns the session cookie.
  @Post('register-institution')
  @AllowAnonymous()
  async register(
    @Body(new ZodValidationPipe(RegisterInstitutionSchema))
    dto: RegisterInstitutionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { cookies, user, institution } =
      await this.registerInstitutionService.register(dto);

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
