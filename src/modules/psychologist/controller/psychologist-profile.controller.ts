import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { UpdateProfileSchema } from '../dto/update-profile.dto';
import type { UpdateProfileDto } from '../dto/update-profile.dto';
import { PsychologistService } from '../service/psychologist.service';
import type { Express } from 'express';

@Controller('api/v1/psychologist/me')
export class PsychologistProfileController {
  constructor(private readonly psychologistService: PsychologistService) {}

  @Get('profile')
  @Roles(['PSYCHOLOGIST'])
  async getProfile(@Session() session: UserSession) {
    const { profile, complete } = await this.psychologistService.getProfile(
      session.user.id,
    );
    return { data: profile, complete };
  }

  @Put('profile')
  @Roles(['PSYCHOLOGIST'])
  async updateProfile(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ) {
    const profile = await this.psychologistService.updateProfile(
      session.user.id,
      dto,
    );
    const complete =
      !!profile.fullName &&
      !!profile.licenseNumber &&
      !!profile.signatureImagePath;
    return { data: profile, complete };
  }

  @Post('signature')
  @Roles(['PSYCHOLOGIST'])
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } }),
  )
  async uploadSignature(
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const profile = await this.psychologistService.saveSignature(
      session.user.id,
      file,
    );
    const complete =
      !!profile.fullName &&
      !!profile.licenseNumber &&
      !!profile.signatureImagePath;
    return {
      data: { signatureImagePath: profile.signatureImagePath },
      complete,
    };
  }
}
