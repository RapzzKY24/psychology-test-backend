import { Module } from '@nestjs/common';
import { AdminPingController } from './controller/admin-ping.controller';
import { AdminUsersController } from './controller/admin-users.controller';
import { AdminPsychologistsController } from './controller/admin-psychologists.controller';
import { AdminService } from './service/admin.service';

@Module({
  controllers: [
    AdminPingController,
    AdminUsersController,
    AdminPsychologistsController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
