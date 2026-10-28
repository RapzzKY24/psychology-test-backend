import { Module } from '@nestjs/common';
import { AdminPingController } from './controller/admin-ping.controller';
import { AdminUsersController } from './controller/admin-users.controller';
import { AdminPsychologistsController } from './controller/admin-psychologists.controller';
import { AdminStatsController } from './controller/admin-stats.controller';
import { AdminService } from './service/admin.service';
import { AdminStatsService } from './service/admin-stats.service';
import { ADMIN_REPOSITORY } from './repository/admin.repository';
import { PrismaAdminRepository } from './repository/admin.prisma-repository';
import { ADMIN_STATS_REPOSITORY } from './repository/admin-stats.repository';
import { PrismaAdminStatsRepository } from './repository/admin-stats.prisma-repository';

@Module({
  controllers: [
    AdminPingController,
    AdminUsersController,
    AdminPsychologistsController,
    AdminStatsController,
  ],
  providers: [
    AdminService,
    AdminStatsService,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
    { provide: ADMIN_STATS_REPOSITORY, useClass: PrismaAdminStatsRepository },
  ],
})
export class AdminModule {}
