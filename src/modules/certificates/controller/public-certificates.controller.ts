import { Controller, Get, Ip, Param } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PublicCertificatesService } from '../service/public-certificates.service';
import type { PublicCertificateVerification } from '../service/public-certificates.service';

/**
 * Dipindai dari QR di sertifikat. Terpisah dari
 * `/api/v1/public/reports/verify/:code` (laporan) dan
 * `/api/v1/public/verify/:code` (hasil tes).
 */
@Controller('api/v1/public/certificates')
export class PublicCertificatesController {
  constructor(private readonly certificates: PublicCertificatesService) {}

  @Get('verify/:code')
  @AllowAnonymous()
  async verify(
    @Param('code') code: string,
    @Ip() ip: string,
  ): Promise<PublicCertificateVerification> {
    return this.certificates.verify(code, ip || 'unknown');
  }
}
