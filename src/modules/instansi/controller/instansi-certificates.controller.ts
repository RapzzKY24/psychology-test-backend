import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { InstansiCertificatesService } from '../service/instansi-certificates.service';

const UuidPipe = new ZodValidationPipe(z.string().uuid());

@Controller('api/v1/instansi/certificates')
@Roles(['INSTANSI'])
export class InstansiCertificatesController {
  constructor(private readonly certificates: InstansiCertificatesService) {}

  /** Read-only download. Issuing and revoking stay with the psychologist. */
  @Get(':id/pdf')
  async downloadPdf(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.certificates.downloadPdf(
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
