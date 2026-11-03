import { Module } from '@nestjs/common';
import { PrismaCertificatesRepository } from './repository/certificates.prisma-repository';
import { CERTIFICATES_REPOSITORY } from './repository/certificates.repository';

/**
 * Exposes the repository token only. Controllers and the service arrive in
 * later phases; nothing outside this module should depend on them yet.
 */
@Module({
  providers: [
    {
      provide: CERTIFICATES_REPOSITORY,
      useClass: PrismaCertificatesRepository,
    },
  ],
  exports: [CERTIFICATES_REPOSITORY],
})
export class CertificatesModule {}
