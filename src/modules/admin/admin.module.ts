import { Module } from '@nestjs/common';
import { AdminPingController } from './controller/admin-ping.controller';
import { AdminUsersController } from './controller/admin-users.controller';
import { AdminPsychologistsController } from './controller/admin-psychologists.controller';
import { AdminService } from './service/admin.service';
import { ADMIN_REPOSITORY } from './repository/admin.repository';
import { PrismaAdminRepository } from './repository/admin.prisma-repository';

@Module({
  controllers: [
    AdminPingController,
    AdminUsersController,
    AdminPsychologistsController,
  ],
  providers: [
    AdminService,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
  ],
})
export class AdminModule {}
