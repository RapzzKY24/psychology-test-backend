import { Module } from '@nestjs/common';
import { SessionsController } from './controller/sessions.controller';
import { SessionsService } from './service/sessions.service';
import { PrismaSessionsRepository } from './repository/sessions.prisma-repository';
import { SESSIONS_REPOSITORY } from './repository/sessions.repository';

@Module({
  controllers: [SessionsController],
  providers: [
    SessionsService,
    { provide: SESSIONS_REPOSITORY, useClass: PrismaSessionsRepository },
  ],
})
export class SessionsModule {}
