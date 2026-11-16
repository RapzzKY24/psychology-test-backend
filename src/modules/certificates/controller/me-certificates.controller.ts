import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { MeCertificatesService } from '../service/me-certificates.service';
import type { MeCertificateItemDto } from '../dto/me-certificate.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

const UuidPipe = new ZodValidationPipe(z.string().uuid());

@Controller('api/v1/me/certificates')
export class MeCertificatesController {
  constructor(private readonly certificates: MeCertificatesService) {}

  /** The caller's own issued certificates, newest first. */
  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<MeCertificateItemDto>> {
    return this.certificates.list(session.user.id, query);
  }

  /** The signed page, inline so the browser opens it. */
  @Get(':id/pdf')
  async downloadPdf(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.certificates.download(
      session.user.id,
      id,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
      length: buffer.length,
    });
  }
}
