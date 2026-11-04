import { Module } from '@nestjs/common';
import { EventLogModule } from '../event-log/event-log.module';
import { ReportsModule } from '../reports/reports.module';
import { CertificateAssetsService } from './pdf/certificate-assets';
import { PrismaCertificatesRepository } from './repository/certificates.prisma-repository';
import { CERTIFICATES_REPOSITORY } from './repository/certificates.repository';
import { CertificatesService } from './service/certificates.service';
import { CertificateDocumentService } from './service/certificate-document.service';
import { CertificatesController } from './controller/certificates.controller';
import { PublicCertificatesController } from './controller/public-certificates.controller';
import { PublicCertificatesService } from './service/public-certificates.service';

@Module({
  imports: [EventLogModule, ReportsModule],
  controllers: [CertificatesController, PublicCertificatesController],
  providers: [
    CertificatesService,
    CertificateDocumentService,
    CertificateAssetsService,
    PublicCertificatesService,
    {
      provide: CERTIFICATES_REPOSITORY,
      useClass: PrismaCertificatesRepository,
    },
  ],
  exports: [CERTIFICATES_REPOSITORY],
})
export class CertificatesModule {}
