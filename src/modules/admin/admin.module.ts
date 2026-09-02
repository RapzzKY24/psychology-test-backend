import { Module } from '@nestjs/common';
import { AdminPingController } from './controller/admin-ping.controller';
import { AdminUsersController } from './controller/admin-users.controller';
import { AdminService } from './service/admin.service';

@Module({
  controllers: [AdminPingController, AdminUsersController],
  providers: [AdminService],
})
export class AdminModule {}
