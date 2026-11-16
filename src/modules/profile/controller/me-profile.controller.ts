import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { MeProfileService } from '../service/me-profile.service';
import { UpdateMeProfileSchema } from '../dto/me-profile.dto';
import type { UpdateMeProfileDto } from '../dto/me-profile.dto';
import type { MeProfileData } from '../repository/me-profile.repository';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/me/profile')
export class MeProfileController {
  constructor(private readonly profile: MeProfileService) {}

  @Get()
  async get(
    @Session() session: UserSession,
  ): Promise<ApiResponse<MeProfileData>> {
    return { data: await this.profile.get(session.user.id) };
  }

  @Patch()
  async update(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(UpdateMeProfileSchema))
    dto: UpdateMeProfileDto,
  ): Promise<ApiResponse<MeProfileData>> {
    return {
      data: await this.profile.update(session.user.id, dto),
      message: 'Profile updated',
    };
  }
}
