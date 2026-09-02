import { Module } from '@nestjs/common';
import { InstitutionsController } from './controller/institutions.controller';
import { InstitutionsService } from './service/institutions.service';
import { PrismaInstitutionsRepository } from './repository/institutions.prisma-repository';
import { INSTITUTIONS_REPOSITORY } from './repository/institutions.repository';

@Module({
  controllers: [InstitutionsController],
  providers: [
    InstitutionsService,
    {
      provide: INSTITUTIONS_REPOSITORY,
      useClass: PrismaInstitutionsRepository,
    },
  ],
})
export class InstitutionsModule {}
