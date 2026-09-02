import { Module } from '@nestjs/common';
import { SessionsController } from './controller/sessions.controller';
import { SessionsPublicController } from './controller/sessions-public.controller';
import { SessionsService } from './service/sessions.service';
import { PrismaSessionsRepository } from './repository/sessions.prisma-repository';
import { ParticipantTokenGuard } from './guards/participant-token.guard';
import { SESSIONS_REPOSITORY } from './repository/sessions.repository';

@Module({
  controllers: [SessionsController, SessionsPublicController],
  providers: [
    SessionsService,
    ParticipantTokenGuard,
    { provide: SESSIONS_REPOSITORY, useClass: PrismaSessionsRepository },
  ],
})
export class SessionsModule {}
