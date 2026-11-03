import { Module } from '@nestjs/common';
import { EventLogModule } from '../event-log/event-log.module';
import { PrismaCertificatesRepository } from './repository/certificates.prisma-repository';
import { CERTIFICATES_REPOSITORY } from './repository/certificates.repository';
import { CertificatesService } from './service/certificates.service';
import { CertificatesController } from './controller/certificates.controller';

@Module({
  imports: [EventLogModule],
  controllers: [CertificatesController],
  providers: [
    CertificatesService,
    {
      provide: CERTIFICATES_REPOSITORY,
      useClass: PrismaCertificatesRepository,
    },
  ],
  exports: [CERTIFICATES_REPOSITORY],
})
export class CertificatesModule {}
