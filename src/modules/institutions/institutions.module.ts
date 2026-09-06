import { Module } from '@nestjs/common';
import { InstitutionsController } from './controller/institutions.controller';
import { RegisterInstitutionController } from './controller/register-institution.controller';
import { InstitutionsService } from './service/institutions.service';
import { RegisterInstitutionService } from './service/register-institution.service';
import { PrismaInstitutionsRepository } from './repository/institutions.prisma-repository';
import { INSTITUTIONS_REPOSITORY } from './repository/institutions.repository';

@Module({
  controllers: [InstitutionsController, RegisterInstitutionController],
  providers: [
    RegisterInstitutionService,
    InstitutionsService,
    {
      provide: INSTITUTIONS_REPOSITORY,
      useClass: PrismaInstitutionsRepository,
    },
  ],
})
export class InstitutionsModule {}
