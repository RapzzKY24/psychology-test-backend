import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { isProfileComplete } from '../utils/is-profile-complete';
import type { ErrorResponse } from '../../../common/interfaces/api-response.interface';
import { UpdateProfileSchema } from '../dto/update-profile.dto';
import type { UpdateProfileDto } from '../dto/update-profile.dto';
import { PsychologistService } from '../service/psychologist.service';
import type { Express, Response } from 'express';

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
    const complete = isProfileComplete(profile);
    return { data: profile, complete };
  }

  @Get('signature-image')
  @Roles(['PSYCHOLOGIST'])
  async streamSignature(
    @Session() session: UserSession,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.psychologistService.getSignaturePath(
      session.user.id,
    );
    // Callback: the file passed existsSync but can vanish before send
    // (TOCTOU). Without this, @Res() bypasses the exception filter and the
    // request hangs instead of returning the shaped 404.
    res.sendFile(filePath, (err: unknown) => {
      if (err && !res.headersSent) {
        const body: ErrorResponse = {
          statusCode: 404,
          message: 'signature_not_found',
          error: 'NotFoundException',
        };
        res.status(404).json(body);
      }
    });
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
    const complete = isProfileComplete(profile);
    return {
      data: { signatureImagePath: profile.signatureImagePath },
      complete,
    };
  }
}
