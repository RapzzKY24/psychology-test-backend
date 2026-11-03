import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';
import { CreateCertificateSchema } from '../dto/create-certificate.dto';
import type { CreateCertificateDto } from '../dto/create-certificate.dto';
import { UpdateCertificateSchema } from '../dto/update-certificate.dto';
import type { UpdateCertificateDto } from '../dto/update-certificate.dto';
import { CertificatesService } from '../service/certificates.service';
import type { CertificateActor } from '../service/certificates.service';
import type { CertificateRecord } from '../repository/certificates.repository';

const UuidPipe = new ZodValidationPipe(z.string().uuid());

/**
 * better-auth types the additional `role` field loosely, so it can arrive as an
 * array. The role guard has already run; this only answers "is this an admin".
 */
function actorOf(session: UserSession): CertificateActor {
  const { id, role } = session.user;
  const isAdmin = Array.isArray(role)
    ? role.includes('ADMIN')
    : role === 'ADMIN';
  return { id, isAdmin };
}

@Controller('api/v1/certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Opens (or reopens) the draft for an approved, non-WPT result. */
  @Post()
  @Roles(['PSYCHOLOGIST'])
  async create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(CreateCertificateSchema))
    dto: CreateCertificateDto,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.createDraft(session.user.id, dto);
    return { data };
  }

  /** Partial save. Only the owning psychologist or an admin may call it. */
  @Patch(':id')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async update(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCertificateSchema))
    dto: UpdateCertificateDto,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.update(actorOf(session), id, dto);
    return { data };
  }

  @Post(':id/photo')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } }),
  )
  async uploadPhoto(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.uploadPhoto(
      actorOf(session),
      id,
      file,
    );
    return { data };
  }
}
